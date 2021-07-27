## Initial command

```sh
npm init -y
npm install -D electron
node_modules/.bin/electron --version
npx electron
npm install -D electron-builder
npm install masakiq/RPC
npm install ws
```

## Prepare

```sh
npm install
```

## Run

```sh
node_modules/.bin/electron src/
```

* development env

```sh
env ENV_TYPE=development node_modules/.bin/electron src/
```

## Build package

### macOS

```sh
node_modules/.bin/electron-builder -m
```
