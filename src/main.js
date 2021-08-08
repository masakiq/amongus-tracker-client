/* eslint-disable no-console */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const url = require('url');
const RPC = require('discord-rpc');
const WS = require('ws');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
const development = process.env.ENV_TYPE == 'development';

let mainWindow;
const CustomUrlScheme = 'amongustracker';
var allowedOrigin = [];
if (development) {
  allowedOrigin.push('http://localhost:8080');
} else {
  allowedOrigin.push('https://client.amongus-tracker.com');
}

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
    },
  });

  if (development) {
    mainWindow.loadURL('http://localhost:8080');
  } else {
    mainWindow.loadURL('https://client.amongus-tracker.com');
  }

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

app.on('open-url', (e, url) => {
  console.log(url);
  if (mainWindow === null) {
    createWindow();
  }
  mainWindow.reload();
  mainWindow.loadURL(url.replace(CustomUrlScheme, 'http'));
  mainWindow.focus();
});

app.setAsDefaultProtocolClient(CustomUrlScheme);

// ** for RPC **

const rpcClient = new RPC.Client({ transport: 'ipc' });
// check origin
// https://github.com/websockets/ws/issues/1271
const wsServer = new WS.Server({
  verifyClient (info) {
    console.log(info.origin);
    console.log(info.req.headers.host);
    return allowedOrigin.includes(info.origin);
  },
  port: 6473
});

var subscribed = [];

wsServer.on('connection', ws => {
  console.log('wsServer connection');

  ws.on('message', message => handleMessageFromWebBrowser(message));
  ws.on('close', () => {
    console.log('wsServer close');
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

rpcClient.on('ready', (args) => {
  var result = {};
  result['cmd'] = 'SUCCESS_AUTHENTICATE';
  var json = JSON.stringify(result);
  sendMessageToWebBrowser(json);
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
  // console.log('SPEAKING_START');
  try {
    args['cmd'] = 'SPEAKING_START';
    var json = JSON.stringify(args);
    sendMessageToWebBrowser(json);
  } catch (error) {
    console.error(error);
  }
});

rpcClient.on('SPEAKING_STOP', (args) => {
  // console.log('SPEAKING_STOP');
  try {
    args['cmd'] = 'SPEAKING_STOP';
    var json = JSON.stringify(args);
    sendMessageToWebBrowser(json);
  } catch (error) {
    console.error(error);
  }
});
