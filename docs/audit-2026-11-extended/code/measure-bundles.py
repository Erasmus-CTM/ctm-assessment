#!/usr/bin/env python3
"""Measure uncompressed static HTML and direct local script/stylesheet references.
Dynamic imports, fonts, wasm and arbitrary fetches are deliberately not guessed.
"""
import argparse,json,pathlib,urllib.parse
from html.parser import HTMLParser
class Refs(HTMLParser):
 def __init__(self):super().__init__();self.urls=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=='script' and d.get('src'):self.urls.append(d['src'])
  if tag=='link' and 'stylesheet' in d.get('rel','').split() and d.get('href'):self.urls.append(d['href'])
p=argparse.ArgumentParser();p.add_argument('site',type=pathlib.Path);p.add_argument('pages',nargs='+');a=p.parse_args();result=[]
for name in a.pages:
 page=a.site/name;h=Refs();h.feed(page.read_text());local={};external=[];missing=[]
 for url in h.urls:
  u=urllib.parse.urlsplit(url)
  if u.scheme or u.netloc:external.append(url);continue
  f=(a.site/u.path.lstrip('/') if u.path.startswith('/') else page.parent/u.path).resolve()
  if f.is_file():local[str(f.relative_to(a.site.resolve()))]=f.stat().st_size
  else:missing.append(url)
 result.append({'page':name,'html_bytes':page.stat().st_size,'direct_local_resources':len(local),'direct_local_bytes':sum(local.values()),'external_references':sorted(set(external)),'missing_local':missing})
print(json.dumps(result,indent=2))
