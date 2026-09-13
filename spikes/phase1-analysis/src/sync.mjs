import { writeFile } from 'node:fs/promises';
import { mergeAnalysisState, openAssetDatabase, upsertAssets } from './database.mjs';
import { scanLibrary } from './library-index.mjs';
import { toDesktopProjection } from './projection.mjs';

export async function synchronizeLibrary({ libraryRoot, workspaceRoot, databasePath, projectionPath }) {
  const scannedAssets = await scanLibrary({ libraryRoot, workspaceRoot });
  const database = openAssetDatabase(databasePath);
  upsertAssets(database, scannedAssets);
  const assets = mergeAnalysisState(database, scannedAssets);
  database.close();
  const projection = toDesktopProjection(assets);
  if (projectionPath) await writeFile(projectionPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  return projection;
}
