using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

internal static class Program
{
    private const string HostName = "com.suoyinshi.capture";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    private static readonly HashSet<string> SupportedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp"
    };

    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--print-paths")
        {
            Console.WriteLine(Json.Serialize(new { staging_root = GetStagingRoot(), runtime_root = GetRuntimeRoot() }));
            return 0;
        }

        try
        {
            using (var input = Console.OpenStandardInput())
            using (var output = Console.OpenStandardOutput())
            {
                while (true)
                {
                    var message = ReadMessage(input);
                    if (message == null) break;
                    WriteMessage(output, HandleMessage(message));
                }
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(HostName + ": " + error);
            return 1;
        }
    }

    private static IDictionary<string, object> ReadMessage(Stream input)
    {
        var lengthBytes = new byte[4];
        var first = input.Read(lengthBytes, 0, 4);
        if (first == 0) return null;
        if (first != 4) throw new InvalidDataException("Incomplete native message header.");
        var length = BitConverter.ToInt32(lengthBytes, 0);
        if (length <= 0 || length > 16 * 1024 * 1024) throw new InvalidDataException("Invalid message length.");
        var payload = new byte[length];
        var offset = 0;
        while (offset < length)
        {
            var read = input.Read(payload, offset, length - offset);
            if (read <= 0) throw new EndOfStreamException("Incomplete native message payload.");
            offset += read;
        }
        return Json.DeserializeObject(Encoding.UTF8.GetString(payload)) as IDictionary<string, object>;
    }

    private static void WriteMessage(Stream output, object message)
    {
        var payload = Encoding.UTF8.GetBytes(Json.Serialize(message));
        var length = BitConverter.GetBytes(payload.Length);
        output.Write(length, 0, length.Length);
        output.Write(payload, 0, payload.Length);
        output.Flush();
    }

    private static object HandleMessage(IDictionary<string, object> envelope)
    {
        var messageId = GetString(envelope, "message_id");
        try
        {
            if (GetInt(envelope, "schema_version") != 1) return Failure(messageId, null, "SCHEMA_UNSUPPORTED", "通信协议版本不受支持");
            if (GetString(envelope, "type") == "app.hello")
            {
                return new
                {
                    schema_version = 1,
                    message_id = messageId,
                    type = "app.status",
                    payload = new { state = "connected", host_version = "0.2.5" }
                };
            }
            if (GetString(envelope, "type") == "library.reveal")
                return RevealLibrary(messageId);
            if (GetString(envelope, "type") == "asset.reveal")
                return RevealAsset(messageId, GetDictionary(envelope, "payload"));
            if (GetString(envelope, "type") == "capture.fetch")
                return FetchCapture(messageId, GetDictionary(envelope, "payload"));
            if (GetString(envelope, "type") != "capture.enqueue") return Failure(messageId, null, "MESSAGE_UNSUPPORTED", "消息类型不受支持");
            var payload = GetDictionary(envelope, "payload");
            return ImportCapture(messageId, payload);
        }
        catch (Exception error)
        {
            return Failure(messageId, null, "INVALID_MESSAGE", error.Message);
        }
    }

    private static object FetchCapture(string messageId, IDictionary<string, object> payload)
    {
        var captureId = Required(payload, "capture_id");
        Uri imageUri;
        if (!Uri.TryCreate(Required(payload, "image_url"), UriKind.Absolute, out imageUri))
            return Failure(messageId, captureId, "IMAGE_URL_INVALID", "图片地址无效");

        var spikeMode = Environment.GetEnvironmentVariable("SUOYINSHI_SPIKE_MODE") == "1";
        var allowedHost = imageUri.Scheme == Uri.UriSchemeHttps
            && (imageUri.Host.EndsWith(".xhscdn.com", StringComparison.OrdinalIgnoreCase)
                || imageUri.Host.Equals("xhscdn.com", StringComparison.OrdinalIgnoreCase)
                || imageUri.Host.EndsWith(".xiaohongshu.com", StringComparison.OrdinalIgnoreCase));
        if (spikeMode && imageUri.IsLoopback && imageUri.Scheme == Uri.UriSchemeHttp) allowedHost = true;
        if (!allowedHost)
            return Failure(messageId, captureId, "IMAGE_HOST_NOT_ALLOWED", "该站点不允许使用本地获取链路");

        var extension = GetString(payload, "extension").ToLowerInvariant();
        if (extension == "jpeg") extension = "jpg";
        var dottedExtension = "." + extension;
        if (!SupportedExtensions.Contains(dottedExtension))
            return Failure(messageId, captureId, "UNSUPPORTED_FORMAT", "暂不支持该图片格式");

        var stagingDirectory = Path.Combine(GetStagingRoot(), DateTime.Now.ToString("yyyy-MM"));
        Directory.CreateDirectory(stagingDirectory);
        var temporaryPath = Path.Combine(stagingDirectory, SafeId(captureId) + dottedExtension);
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(imageUri);
            request.Method = "GET";
            request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";
            request.Accept = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8";
            request.Timeout = 20000;
            request.ReadWriteTimeout = 20000;
            var pageUrl = GetString(payload, "page_url");
            Uri pageUri;
            if (Uri.TryCreate(pageUrl, UriKind.Absolute, out pageUri)
                && (pageUri.Scheme == Uri.UriSchemeHttps || (spikeMode && pageUri.IsLoopback)))
                request.Referer = pageUri.AbsoluteUri;

            using (var response = (HttpWebResponse)request.GetResponse())
            {
                if (response.ContentLength > 25 * 1024 * 1024)
                    return Failure(messageId, captureId, "IMAGE_TOO_LARGE", "图片超过 25 MB");
                using (var input = response.GetResponseStream())
                using (var output = new FileStream(temporaryPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    var buffer = new byte[81920];
                    long total = 0;
                    int read;
                    while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        total += read;
                        if (total > 25 * 1024 * 1024) throw new InvalidDataException("图片超过 25 MB");
                        output.Write(buffer, 0, read);
                    }
                    output.Flush(true);
                }
            }
            payload["temporary_path"] = temporaryPath;
            return ImportCapture(messageId, payload);
        }
        catch (Exception error)
        {
            try { if (File.Exists(temporaryPath)) File.Delete(temporaryPath); } catch { }
            return Failure(messageId, captureId, "SITE_IMAGE_FETCH_FAILED", "小红书图片获取失败：" + error.Message);
        }
    }

    private static object RevealLibrary(string messageId)
    {
        var libraryRoot = Path.GetFullPath(Path.Combine(GetRuntimeRoot(), "library"));
        try
        {
            Directory.CreateDirectory(libraryRoot);
            var simulated = Environment.GetEnvironmentVariable("SUOYINSHI_SPIKE_MODE") == "1";
            if (!simulated)
                System.Diagnostics.Process.Start("explorer.exe", "\"" + libraryRoot + "\"");
            return new
            {
                schema_version = 1,
                message_id = messageId,
                type = "library.reveal.result",
                payload = new { state = "opened", library_root = libraryRoot, simulated }
            };
        }
        catch (Exception error)
        {
            return new
            {
                schema_version = 1,
                message_id = messageId,
                type = "library.reveal.result",
                payload = new { state = "failed", error_code = "LIBRARY_REVEAL_FAILED", message = error.Message }
            };
        }
    }

    private static object RevealAsset(string messageId, IDictionary<string, object> payload)
    {
        var managedPath = Path.GetFullPath(Required(payload, "managed_path"));
        var libraryRoot = Path.GetFullPath(Path.Combine(GetRuntimeRoot(), "library"))
            .TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!managedPath.StartsWith(libraryRoot, StringComparison.OrdinalIgnoreCase))
            return RevealFailure(messageId, "PATH_OUTSIDE_LIBRARY", "只能打开素材库内的文件");
        if (!File.Exists(managedPath))
            return RevealFailure(messageId, "ASSET_FILE_MISSING", "图片文件不存在");

        try
        {
            var simulated = Environment.GetEnvironmentVariable("SUOYINSHI_SPIKE_MODE") == "1";
            if (!simulated)
                System.Diagnostics.Process.Start("explorer.exe", "/select,\"" + managedPath + "\"");
            return new
            {
                schema_version = 1,
                message_id = messageId,
                type = "asset.reveal.result",
                payload = new { state = "opened", managed_path = managedPath, simulated }
            };
        }
        catch (Exception error)
        {
            return RevealFailure(messageId, "REVEAL_FAILED", error.Message);
        }
    }

    private static object RevealFailure(string messageId, string code, string message)
    {
        return new
        {
            schema_version = 1,
            message_id = messageId,
            type = "asset.reveal.result",
            payload = new { state = "failed", error_code = code, message }
        };
    }

    private static object ImportCapture(string messageId, IDictionary<string, object> payload)
    {
        var captureId = Required(payload, "capture_id");
        var runtimeRoot = GetRuntimeRoot();
        var jobsRoot = Path.Combine(runtimeRoot, "jobs");
        Directory.CreateDirectory(jobsRoot);
        var jobPath = Path.Combine(jobsRoot, SafeId(captureId) + ".json");
        if (File.Exists(jobPath))
        {
            var existing = Json.DeserializeObject(File.ReadAllText(jobPath, Encoding.UTF8)) as IDictionary<string, object>;
            if (existing != null) existing["message_id"] = messageId;
            return existing;
        }

        var temporaryPath = Path.GetFullPath(Required(payload, "temporary_path"));
        var stagingRoot = Path.GetFullPath(GetStagingRoot()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!temporaryPath.StartsWith(stagingRoot, StringComparison.OrdinalIgnoreCase))
            return Persist(jobPath, Failure(messageId, captureId, "PATH_OUTSIDE_STAGING", "暂存文件不在允许目录内"));
        if (!File.Exists(temporaryPath))
            return Persist(jobPath, Failure(messageId, captureId, "STAGING_FILE_MISSING", "暂存文件不存在"));

        var extension = Path.GetExtension(temporaryPath);
        if (!SupportedExtensions.Contains(extension))
            return Persist(jobPath, Failure(messageId, captureId, "UNSUPPORTED_FORMAT", "暂不支持该图片格式"));

        var projectType = SanitizeSegment(Required(payload, "project_type_name"), "未分类");
        var pageTitle = SanitizeSegment(GetString(payload, "page_title"), SanitizeSegment(GetString(payload, "site_name"), "未命名项目") + " " + DateTime.Now.ToString("yyyy-MM-dd"));
        var libraryRoot = Path.Combine(runtimeRoot, "library");
        var projectRoot = Path.Combine(libraryRoot, projectType, pageTitle);
        Directory.CreateDirectory(projectRoot);

        var hash = Sha256(temporaryPath);
        var duplicate = Directory.EnumerateFiles(projectRoot)
            .Where(path => SupportedExtensions.Contains(Path.GetExtension(path)))
            .FirstOrDefault(path => String.Equals(Sha256(path), hash, StringComparison.OrdinalIgnoreCase));
        if (duplicate != null)
        {
            File.Delete(temporaryPath);
            return Persist(jobPath, Success(messageId, captureId, "duplicate", duplicate, hash));
        }

        var shortId = SafeId(captureId).Substring(0, Math.Min(8, SafeId(captureId).Length));
        var filename = DateTime.Now.ToString("yyyyMMdd-HHmmss") + "_" + shortId + extension.ToLowerInvariant();
        var targetPath = UniquePath(projectRoot, filename);
        var partialPath = targetPath + ".partial";
        File.Copy(temporaryPath, partialPath, false);
        using (var stream = new FileStream(partialPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) stream.Flush(true);
        File.Move(partialPath, targetPath);

        var sourcePath = targetPath + ".source.json";
        var source = new Dictionary<string, object>
        {
            { "schema_version", 1 },
            { "capture_id", captureId },
            { "content_hash", "sha256:" + hash },
            { "project_type_name", GetString(payload, "project_type_name") },
            { "page_title", GetString(payload, "page_title") },
            { "page_url", GetString(payload, "page_url") },
            { "image_url", GetString(payload, "image_url") },
            { "site_name", GetString(payload, "site_name") },
            { "captured_at", GetString(payload, "captured_at") },
            { "managed_path", targetPath }
        };
        File.WriteAllText(sourcePath, Json.Serialize(source), new UTF8Encoding(false));
        File.Delete(temporaryPath);
        return Persist(jobPath, Success(messageId, captureId, "imported", targetPath, hash));
    }

    private static object Persist(string jobPath, object result)
    {
        File.WriteAllText(jobPath, Json.Serialize(result), new UTF8Encoding(false));
        return result;
    }

    private static object Success(string messageId, string captureId, string state, string managedPath, string hash)
    {
        return new
        {
            schema_version = 1,
            message_id = messageId,
            type = "capture.result",
            payload = new { capture_id = captureId, state, managed_path = managedPath, content_hash = "sha256:" + hash }
        };
    }

    private static object Failure(string messageId, string captureId, string code, string message)
    {
        return new
        {
            schema_version = 1,
            message_id = messageId,
            type = "capture.result",
            payload = new { capture_id = captureId, state = "failed", error_code = code, message }
        };
    }

    private static string GetRuntimeRoot()
    {
        var spikeMode = Environment.GetEnvironmentVariable("SUOYINSHI_SPIKE_MODE") == "1";
        var overridePath = Environment.GetEnvironmentVariable("SUOYINSHI_RUNTIME_ROOT");
        if (spikeMode && !String.IsNullOrWhiteSpace(overridePath)) return Path.GetFullPath(overridePath);
        return Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "runtime"));
    }

    private static string GetStagingRoot()
    {
        var spikeMode = Environment.GetEnvironmentVariable("SUOYINSHI_SPIKE_MODE") == "1";
        var overridePath = Environment.GetEnvironmentVariable("SUOYINSHI_STAGING_ROOT");
        if (spikeMode && !String.IsNullOrWhiteSpace(overridePath)) return Path.GetFullPath(overridePath);
        return Path.Combine(GetDownloadsFolder(), "索引室待导入");
    }

    private static string GetDownloadsFolder()
    {
        var id = new Guid("374DE290-123F-4565-9164-39C4925E467B");
        IntPtr pathPointer;
        var result = SHGetKnownFolderPath(ref id, 0, IntPtr.Zero, out pathPointer);
        if (result != 0) throw new InvalidOperationException("无法确定浏览器下载目录");
        try { return Marshal.PtrToStringUni(pathPointer); }
        finally { Marshal.FreeCoTaskMem(pathPointer); }
    }

    private static string SanitizeSegment(string value, string fallback)
    {
        var text = Regex.Replace((value ?? "").Trim(), "[<>:\"/\\\\|?*\\x00-\\x1F]", " ");
        text = Regex.Replace(text, "\\s+", " ").Trim().TrimEnd('.');
        if (String.IsNullOrWhiteSpace(text)) text = fallback;
        var reserved = new Regex("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$", RegexOptions.IgnoreCase);
        if (reserved.IsMatch(text)) text = "_" + text;
        return text.Length > 80 ? text.Substring(0, 80).TrimEnd() : text;
    }

    private static string SafeId(string value)
    {
        var safe = Regex.Replace(value ?? "", "[^A-Za-z0-9_-]", "");
        if (String.IsNullOrEmpty(safe)) throw new InvalidDataException("capture_id 无效");
        return safe;
    }

    private static string UniquePath(string directory, string filename)
    {
        var path = Path.Combine(directory, filename);
        if (!File.Exists(path)) return path;
        var stem = Path.GetFileNameWithoutExtension(filename);
        var extension = Path.GetExtension(filename);
        for (var index = 2; index < 10000; index++)
        {
            path = Path.Combine(directory, stem + "_" + index + extension);
            if (!File.Exists(path)) return path;
        }
        throw new IOException("无法生成唯一文件名");
    }

    private static string Sha256(string path)
    {
        using (var stream = File.OpenRead(path))
        using (var algorithm = SHA256.Create())
            return BitConverter.ToString(algorithm.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    private static IDictionary<string, object> GetDictionary(IDictionary<string, object> value, string key)
    {
        object item;
        if (!value.TryGetValue(key, out item) || !(item is IDictionary<string, object>)) throw new InvalidDataException(key + " 缺失");
        return (IDictionary<string, object>)item;
    }

    private static string Required(IDictionary<string, object> value, string key)
    {
        var text = GetString(value, key);
        if (String.IsNullOrWhiteSpace(text)) throw new InvalidDataException(key + " 缺失");
        return text;
    }

    private static string GetString(IDictionary<string, object> value, string key)
    {
        object item;
        return value != null && value.TryGetValue(key, out item) && item != null ? Convert.ToString(item) : "";
    }

    private static int GetInt(IDictionary<string, object> value, string key)
    {
        object item;
        return value != null && value.TryGetValue(key, out item) && item != null ? Convert.ToInt32(item) : 0;
    }

    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(ref Guid rfid, uint flags, IntPtr token, out IntPtr path);
}
