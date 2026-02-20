# Widget Wizard backend

## Requirements

- libwebsockets
- libjansson
- glib

### Install dependencies on Debian/Ubuntu

```shell
sudo apt install libwebsockets-dev libjansson-dev libglib2.0-dev
```

## Build for host

```shell
make host
```

## Deploy app to target

```shell
make deploy
```
