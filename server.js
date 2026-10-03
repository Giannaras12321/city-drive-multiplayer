const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();

function clean(v,max){return String(v||'').replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,max);}
function code(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,20);}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function broadcast(room,obj,except){for(const p of room.players.values())if(p.ws!==except)send(p.ws,obj);}
function spawnFor(room){const i=room.players.size;return {x:3400+(i%4)*130,y:2300+Math.floor(i/4)*100};}

const server=http.createServer((req,res)=>{
  let u=req.url.split('?')[0];
  if(u==='/')u='/index.html';
  const file=path.join(ROOT,u.replace(/^\//,''));
  if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}
    const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  });
});
const wss=new WebSocket.Server({server,path:'/ws'});

wss.on('connection',ws=>{
  let me=null;
  ws.on('message',raw=>{
    let d;try{d=JSON.parse(raw)}catch{return;}
    if(d.type==='create'||d.type==='join'){
      const c=code(d.code), u=clean(d.user,20)||'Player', party=clean(d.party,30)||'City Crew';
      if(c.length<4)return send(ws,{type:'error',message:'Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες.',fatal:true});
      let room=rooms.get(c);
      if(d.type==='create'){
        if(room)return send(ws,{type:'error',message:'Αυτό το party code χρησιμοποιείται ήδη.',fatal:true});
        room={code:c,party,players:new Map()};rooms.set(c,room);
      }else{
        if(!room)return send(ws,{type:'error',message:'Δεν βρέθηκε party με αυτόν τον κωδικό.',fatal:true});
        if(room.players.size>=8)return send(ws,{type:'error',message:'Το party είναι γεμάτο (μέχρι 8 παίκτες).',fatal:true});
      }
      const id=Math.random().toString(36).slice(2,10);
      me={id,ws,user:u,room,spawn:spawnFor(room),x:spawnFor(room).x,y:spawnFor(room).y,a:0,inCar:false,carIndex:null};
      room.players.set(id,me);
      const type=d.type==='create'?'roomCreated':'roomJoined';
      send(ws,{type,code:c,party:room.party,selfId:id,spawn:me.spawn});
      send(ws,{type:'playerList',selfId:id,players:[...room.players.values()].map(p=>({id:p.id,user:p.user,x:p.x,y:p.y,a:p.a,inCar:p.inCar,carIndex:p.carIndex}))});
      broadcast(room,{type:'playerJoined',id,user:u,x:me.x,y:me.y,a:0,inCar:false,carIndex:null},ws);
      return;
    }
    if(!me)return;
    if(d.type==='state'){
      me.x=Number(d.x)||0;me.y=Number(d.y)||0;me.a=Number(d.a)||0;me.user=clean(d.user,20)||me.user;me.inCar=!!d.inCar;me.carIndex=Number.isInteger(d.carIndex)?d.carIndex:null;
      broadcast(me.room,{type:'state',id:me.id,x:me.x,y:me.y,a:me.a,user:me.user,inCar:me.inCar,carIndex:me.carIndex},ws);
    }
  });
  ws.on('close',()=>{if(!me)return;const room=me.room;room.players.delete(me.id);broadcast(room,{type:'playerLeft',id:me.id});if(room.players.size===0)rooms.delete(room.code);});
});

server.listen(PORT,()=>console.log(`CITY DRIVE MULTIPLAYER running at http://localhost:${PORT}`));
