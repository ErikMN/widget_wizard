# Widget Wizard UI

## Requirements

- Node.js
- Yarn (classic 1.22)

## How to build the UI

```shell
yarn build
```

## How to run the development server

First source the setuptarget script (fill out `credentials.json`):

```shell
source setuptarget.sh
```

Then run:

```shell
yarn start
```

## Lind and format

```shell
yarn lint
yarn format
```

## Deploy web to target

From project root run:

```shell
make deployweb
```

## Update web dependencies

```shell
yarn checkupdate
yarn update
```
