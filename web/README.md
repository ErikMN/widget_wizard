# Widget Wizard UI

## Requirements

- Node.js
- Yarn (classic 1.22)

### Install Node.js and Yarn on host

Recommended to use [Node Version Manager](https://github.com/nvm-sh/nvm) for Node.js install

```shell
npm install -g yarn
```

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

## Lint and format

```shell
yarn lint
yarn format
```

## Test widget API compatibility

```shell
node --test tests/widgetApi.test.mjs
```

These tests mock device responses, including the v3 capabilities response whose
parameter definitions are nested under `data.generalParams`.

New v3 widgets use the device's per-type defaults instead of forcing the legacy
`#D0` data source. Configure a data source explicitly for widgets that need one.
Creation requests include an explicit `widgetParams: {}` because omitting the
JSON property may trigger a backend assertion on early v3 firmware.
V3 updates send only changed writable properties, so moving or styling a widget
does not reconfigure its data source.
V3 data sources must start with `#` or `%` followed by letters, digits or dots.
Incomplete values stay in the editor with a validation message; an empty value
clears the source.

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
