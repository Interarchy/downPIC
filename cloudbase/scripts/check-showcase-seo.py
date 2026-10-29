"""校验官网 SEO 静态产物；不访问网络、不写入源文件。"""
from html.parser import HTMLParser
from pathlib import Path
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2] / 'opendesign/mockups/archbuddy-showcase'
ORIGIN = 'https://www.archbuddy.top'
PAGES = {
    'index.html': '/', 'index-en.html': '/index-en.html',
    'guides/index.html': '/guides/',
    'guides/organize-references.html': '/guides/organize-references.html',
    'guides/reference-to-prompt.html': '/guides/reference-to-prompt.html',
    'case-study/index.html': '/case-study/',
    **{f'case-study/{name}.html': f'/case-study/{name}.html'
       for name in ('problem', 'workflow', 'decisions', 'outcomes')},
}
LANGUAGES = {'zh-CN': ORIGIN+'/', 'en': ORIGIN+'/index-en.html', 'x-default': ORIGIN+'/'}

class Head(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.tags = []
        self.title = ''
        self.titles = 0
        self.in_title = False
        self.in_json = False
        self.blocks = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head':
            self.inside = True
        if not self.inside:
            return
        self.tags.append((tag, attrs))
        if tag == 'title':
            self.titles += 1
            self.in_title = True
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.in_json = True
            self.blocks.append('')

    def handle_endtag(self, tag):
        if tag == 'head': self.inside = False
        if tag == 'title': self.in_title = False
        if tag == 'script': self.in_json = False

    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.in_json: self.blocks[-1] += data

    def values(self, tag, key, value, result):
        return [a.get(result, '') for t, a in self.tags if t == tag and a.get(key) == value]

errors, titles, descriptions = [], [], []
def require(ok, message):
    if not ok: errors.append(message)

html_files = sorted(ROOT.rglob('*.html'))
for filename in html_files:
    rel = filename.relative_to(ROOT).as_posix()
    head = Head(filename.read_text(encoding='utf-8-sig'))
    robots = ','.join(head.values('meta','name','robots','content')).lower()
    require(head.titles == 1 and head.title.strip(), f'{rel}: missing/duplicate title')
    if rel not in PAGES:
        require('noindex' in robots or 'none' in robots.split(','), f'{rel}: classify new page or add noindex')
        continue
    require('noindex' not in robots and 'none' not in robots.split(','), f'{rel}: unexpectedly noindex')
    require(head.values('link','rel','canonical','href') == [ORIGIN+PAGES[rel]], f'{rel}: canonical mismatch')
    desc = head.values('meta','name','description','content')
    require(len(desc)==1 and bool(desc[0].strip()), f'{rel}: missing/duplicate description')
    require(head.values('meta','property','og:url','content') == [ORIGIN+PAGES[rel]], f'{rel}: OG URL mismatch')
    titles.append(head.title)
    descriptions.extend(desc)
    if rel in ('index.html','index-en.html'):
        links = [a for t,a in head.tags if t=='link' and a.get('rel')=='alternate' and 'hreflang' in a]
        require(len(links)==3 and {a['hreflang']:a.get('href') for a in links}==LANGUAGES, f'{rel}: language links mismatch')
        require(len(head.blocks)==1, f'{rel}: expected one WebSite JSON-LD block')
        for block in head.blocks:
            try:
                data = json.loads(block)
                require(data.get('@type')=='WebSite' and data.get('url')==ORIGIN+'/', f'{rel}: invalid website data')
            except ValueError:
                errors.append(f'{rel}: invalid JSON-LD')
require(len(titles)==len(PAGES), 'missing indexable HTML files')
require(len(titles)==len(set(titles)), 'duplicate page titles')
require(len(descriptions)==len(set(descriptions)), 'duplicate page descriptions')
xml = ET.parse(ROOT/'sitemap.xml')
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
urls=[node.text for node in xml.findall('s:url/s:loc',ns)]
require(xml.getroot().tag=='{'+ns['s']+'}urlset', 'invalid sitemap namespace')
require(len(urls)==len(PAGES) and set(urls)=={ORIGIN+p for p in PAGES.values()}, 'sitemap missing, duplicate, noncanonical or excluded URLs')
robots=(ROOT/'robots.txt').read_text(encoding='utf-8')
require('Sitemap: '+ORIGIN+'/sitemap.xml' in robots, 'robots missing sitemap')
require('User-agent: *' in robots and 'Allow: /' in robots and 'Disallow:' not in robots, 'robots must allow crawlers to read noindex')
if errors:
    raise SystemExit('\n'.join(errors))
print(json.dumps({'status':'PASS','html_pages':len(html_files),'indexable':len(PAGES),'excluded':len(html_files)-len(PAGES),'sitemap_urls':len(urls)}))
