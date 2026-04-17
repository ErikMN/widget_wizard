# Widget Wizard backend

## Requirements

- libwebsockets
- libjansson
- glib

### Install dependencies on Debian/Ubuntu

```shell
sudo apt install libwebsockets-dev libjansson-dev libglib2.0-dev
```

### Install host test dependencies on Debian/Ubuntu

```shell
sudo apt install libcmocka-dev
```

## Build for host

```shell
make host
```

## Run backend unit tests on host

```shell
make hosttest
```

## Deploy app to target

```shell
make deploy
```
