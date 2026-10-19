import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8773);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.webp':'image/webp','.jpg':'image/jpeg'};
http.createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  let name;
  try { name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch {res.writeHead(400);res.end();return;}
  if (name.split('/').some(part => part.startsWith('.'))) {res.writeHead(403);res.end();return;}
  const file = path.resolve(root, '.' + (name.endsWith('/') ? name + 'index.html' : name));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  let stat;
  try {stat = fs.statSync(file); if (!stat.isFile()) throw new Error('Not a file');}
  catch {res.writeHead(404);res.end('Not found');return;}
  const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
  let start=0,end=stat.size-1,status=200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
    if (!match[1]) start = Math.max(0,stat.size-Number(match[2]));
    else {start = Number(match[1]); if (match[2]) end = Math.min(end,Number(match[2]));}
    if (start>end || start>=stat.size) {res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length']=Math.max(0,end-start+1);
  res.writeHead(status,headers);
  if(req.method==='HEAD' || !stat.size) {res.end();return;}
  const stream = fs.createReadStream(file,{start,end});
  stream.on('error',()=>res.destroy());
  res.on('close',()=>stream.destroy());
  stream.pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`CausGround preview: http://127.0.0.1:${port}/`));
