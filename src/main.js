/* eslint-disable no-console */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const url = require('url');
const RPC = require('discord-rpc');
const WS = require('ws');
const http = require('http');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
const development = process.env.ENV_TYPE == 'development';
const wsServertPort = 6473;
const httpServerPort = 6474;

let mainWindow;
var mainUrl;
var allowedOrigin = [];
if (development) {
  mainUrl = 'http://localhost:8080';
  allowedOrigin.push(mainUrl);
} else {
  mainUrl = 'https://client.amongus-tracker.com';
  allowedOrigin.push(mainUrl);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow === null) return;
    focusMainWindow();
  })
}

// HTTP Server
const httpServer = http.createServer();
const pathnames = [
  '/oauth/callback',
  '/favicon.ico'
];

httpServer.on('request', function(req, res) {
  var pathname = url.parse(req.url).pathname;
  var query = url.parse(req.url).query;

  if (!pathnames.includes(pathname)) {
    res.statusCode = 400;
    res.end();
    return;
  }

  if (pathname == '/favicon.ico') {
    res.statusCode = 200;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  var content = `
<!DOCTYPE html>
  <body>
    <p>AmongUsTracker アプリにリダイレクトしました。このウィンドウは閉じてください。</p>
  </body>
</html>
`
  res.write(content);
  res.end();

  if (mainWindow) {
    var redirectUrl = mainUrl + '?' + query;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.loadURL(redirectUrl);
    mainWindow.show();
    mainWindow.focus();
  }
  // focusMainWindow();
});

httpServer.listen(httpServerPort);

httpServer.on('error', (error) => {
  console.log(error);
  app.quit();
})

// WebSocket Server

const wsServer = new WS.Server({
  verifyClient (info) {
    console.log(info.origin);
    console.log(info.req.headers.host);
    return allowedOrigin.includes(info.origin);
  },
  port: wsServertPort
});

wsServer.on('error', (error) => {
  console.log(error);
  app.quit();
})

// main

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const dimensions = display.workAreaSize;
  mainWindow = new BrowserWindow({
    width: dimensions.width,
    height: dimensions.height,
    // resizable: false,
    // titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: development,
    },
  });

  mainWindow.loadURL(mainUrl);

  // mainWindow.loadURL(url.format({
  //   pathname: path.join(__dirname, 'index.html'),
  //   protocol: 'file:',
  //   slashes: true,
  // }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const shell = require('electron').shell;
  mainWindow.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    shell.openExternal(url)
  });
  mainWindow.webContents.on('new-window', (e, url) => {
    e.preventDefault();
    shell.openExternal(url)
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

function focusMainWindow() {
  let focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) {
    const windowList = BrowserWindow.getAllWindows();
    if (windowList && windowList[0]) {
      let mainWindow = windowList[0];
      mainWindow.show();
      mainWindow.focus();
    }
  }
}

// ** for RPC **

let rpcClient;
var subscribed = [];

wsServer.on('connection', ws => {
  console.log('wsServer connection');

  ws.on('message', message => handleMessageFromWebBrowser(message));
  ws.on('close', () => {
    console.log('wsServer close');
    try {
      if (rpcClient != null) {
        rpcClient.destroy();
      }
    } catch (error) {
      console.error(error);
    }
  });
});

function sendMessageToWebBrowser(args) {
  wsServer.clients.forEach(serverClient => {
    serverClient.send(args);
  });
}

function handleMessageFromWebBrowser(message) {
  console.log(message);
  var params = JSON.parse(message)
  if (params['cmd'] == 'AUTHENTICATE') {
    authenticate(params['args']);
  } else if (params['cmd'] == 'GET_SELECTED_VOICE_CHANNEL') {
    getSelectedVoiceChannel();
  } else if (params['cmd'] == 'SUBSCRIBE_VOICE_CHANNEL_SELECT') {
    subscribeVoiceChannelSelect();
  } else if (params['cmd'] == 'GET_CHANNEL') {
    getChannel(params['args']);
  } else if (params['cmd'] == 'SUBSCRIBE') {
    subscribe(params['args']['channel_id']);
  } else if (params['cmd'] == 'UNSUBSCRIBE') {
    unsubscribe(params['args']['channel_id']);
  }
}

function authenticate(args) {
  rpcClient = new RPC.Client({ transport: 'ipc' });
  addListenerRpcClient(rpcClient);
  rpcClient.login({ clientId: args['client_id'], accessToken: args['access_token'], scopes: args['scopes'] }).catch(function(error) {
    handleAuthenticationError(error);
  });
}

function handleAuthenticationError(error) {
  if (error.message == 'Could not connect') {
    var args = {};
    args['cmd'] = 'COULD_NOT_CONNECT';
    var json = JSON.stringify(args);
    sendMessageToWebBrowser(json);
    rpcClient = null;
  } else if (error.message == 'Already authenticated') {
    var args = {};
    args['cmd'] = 'ALREADY_AUTHENTICATED';
    var json = JSON.stringify(args);
    sendMessageToWebBrowser(json);
  } else if (error.message == 'Token does not match current user') {
    var args = {};
    args['cmd'] = 'TOKEN_DOES_NOT_MATCH_CURRENT_USER';
    var json = JSON.stringify(args);
    sendMessageToWebBrowser(json);
  }
}

function getSelectedVoiceChannel() {
  rpcClient.getSelectedVoiceChannel(5000).then((result) => {
    if (result) {
      result['cmd'] = 'GET_SELECTED_VOICE_CHANNEL';
      var json = JSON.stringify(result);
      sendMessageToWebBrowser(json);
    } else {
      result = { 'cmd': 'GET_SELECTED_VOICE_CHANNEL' };
      result['voice_states'] = [];
      var json = JSON.stringify(result);
      sendMessageToWebBrowser(json);
    }
  });
}

function getChannel(args) {
  rpcClient.getChannel(args['channel_id'], 5000).then((result) => {
    result['cmd'] = 'GET_CHANNEL';
    var json = JSON.stringify(result);
    sendMessageToWebBrowser(json);
  });
}

function subscribeVoiceChannelSelect() {
  rpcClient.subscribe('VOICE_CHANNEL_SELECT', (voice_status) => {
    console.log(voice_status);
  });
}

function subscribe(channelId) {
  var sub = rpcClient.subscribe('VOICE_STATE_CREATE', { channel_id: channelId }, (voice_status) => {
    console.log(voice_status);
  });
  subscribed.push(sub);

  sub = rpcClient.subscribe('VOICE_STATE_DELETE', { channel_id: channelId }, (voice_status) => {
    console.log(voice_status);
  });
  subscribed.push(sub);

  sub = rpcClient.subscribe('SPEAKING_START', { channel_id: channelId }, (voice_status) => {
    console.log(voice_status);
  });
  subscribed.push(sub);

  sub = rpcClient.subscribe('SPEAKING_STOP', { channel_id: channelId }, (voice_status) => {
    console.log(voice_status);
  });
  subscribed.push(sub);
}

function unsubscribe(channelId) {
  for (const sub in subscribed) {
    sub.unsubscribe;
  }

  subscribed = [];
}


function addListenerRpcClient(rpcClient) {
  rpcClient.on('ready', (args) => {
    var result = {};
    result['cmd'] = 'SUCCESS_AUTHENTICATE';
    var json = JSON.stringify(result);
    sendMessageToWebBrowser(json);
  });

  rpcClient.on('connected', (args) => {
    console.log('connected');
  });

  rpcClient.transport.on('close', (args) => {
    console.log('close');
  });

  rpcClient.on('disconnected', (args) => {
    var result = {};
    result['cmd'] = 'DISCONNECTED_WITH_DISCORD';
    var json = JSON.stringify(result);
    sendMessageToWebBrowser(json);
    rpcClient.destroy();
    rpcClient = null;
  });

  rpcClient.on('VOICE_CHANNEL_SELECT', (args) => {
    console.log('VOICE_CHANNEL_SELECT');
    try {
      args['cmd'] = 'VOICE_CHANNEL_SELECT';
      var json = JSON.stringify(args);
      sendMessageToWebBrowser(json);
    } catch (error) {
      console.error(error);
    }
  });

  rpcClient.on('VOICE_STATE_CREATE', (args) => {
    console.log('VOICE_STATE_CREATE');
    try {
      args['cmd'] = 'VOICE_STATE_CREATE';
      var json = JSON.stringify(args);
      sendMessageToWebBrowser(json);
    } catch (error) {
      console.error(error);
    }
  });

  rpcClient.on('VOICE_STATE_DELETE', (args) => {
    console.log('VOICE_STATE_DELETE');
    try {
      args['cmd'] = 'VOICE_STATE_DELETE';
      var json = JSON.stringify(args);
      sendMessageToWebBrowser(json);
    } catch (error) {
      console.error(error);
    }
  });

  rpcClient.on('SPEAKING_START', (args) => {
    if (development) {
      console.log('SPEAKING_START');
    }
    try {
      args['cmd'] = 'SPEAKING_START';
      var json = JSON.stringify(args);
      sendMessageToWebBrowser(json);
    } catch (error) {
      console.error(error);
    }
  });

  rpcClient.on('SPEAKING_STOP', (args) => {
    if (development) {
      console.log('SPEAKING_STOP');
    }
    try {
      args['cmd'] = 'SPEAKING_STOP';
      var json = JSON.stringify(args);
      sendMessageToWebBrowser(json);
    } catch (error) {
      console.error(error);
    }
  });
}
