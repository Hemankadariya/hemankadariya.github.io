const chokidar = require('chokidar');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

const wss = new ws.WebSocketServer({port: 9011});

let directory = process.argv[2];

if (!directory) {
    directory = path.join(path.dirname(process.argv[1]), "../expanders");
}
console.log(directory);

try {
    process.chdir(directory);
} catch(e) {
    console.log("error occurred on setting the directory to serve");
    console.log(e);
    process.exit(1);
}

let files = {}; // {filename: content}
let sentFiles = new Map();// {ws: {filename: content}}

let watcher = chokidar.watch('./*.js' ,{
    persistent: true,
    ignored: /^[#]/
});

watcher.on('add', name => {
    loadFile(name).then(() => {
        sendAllFiles();
    });
});
watcher.on('change', name => {
    loadFile(name).then(() => {
        sendAllFiles();
    });
});
watcher.on('unlink', name => {
    delete files[path.basename(name, ".js")];
});

function loadFile(name) {
    let basename = path.basename(name, ".js");
    return new Promise((resolve, reject) => {
        fs.readFile(name, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            }
            resolve(data);
        });
    }).then((file) => {
        files[basename] = file;
        console.log(name);
    });
}

function heartbeat() {
    this.isAlive = true;
}

const interval = setInterval(function ping() {
    for (let ws of sentFiles.keys()) {
        if (ws.isAlive === false) {
            sentFiles.delete(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    }
}, 30000);

wss.on('connection', (ws, request, client)  => {
    sentFiles.set(ws, {});
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    sendFiles(ws);
});

function sendFiles(socket) {
    let toSend = [];

    let newKeys = Object.keys(files);
    let sent = sentFiles.get(socket);
    
    let sentKeys = Object.keys(sent);
    
    newKeys.forEach((k) => {
        if (files[k] && files[k] !== sent[k]) {
            sent[k] = files[k];
            toSend.push({action: "add", name: k, content: files[k]});
        }
    });

    sentKeys.forEach((k) => {
        if (files[k] === undefined && sent[k]) {
            delete sent[k];
            toSend.push({action: "remove", name: k});
        }
    });
    
    socket.send(JSON.stringify(toSend));
}

function sendAllFiles() {
    debugger;
    for (let k of sentFiles.keys()) {
        sendFiles(k);
    }
}

wss.on('close', () => {
    console.log("close", ws);
    clearInterval(interval);
});
