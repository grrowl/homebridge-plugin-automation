<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150"><br /> +<br />

<div style="text-size: bigger;">AI</div>

</p>

# homebridge-ai

Control your homebridge instance with AI.

## Local testing

Simply run `npm run watch` to start. By default it uses the config at `~/.homebridge/config.json`, so if you want to discover local network instance add the correct PIN for your Homebridge instance there.

## Local testing (in docker)

This runs segregated from your local network for more specific testing scenarios.

```shell
docker run --name=homebridge-ai -p 18581:8581 -v $(pwd)/homebridge:/homebridge -v $(pwd):/var/lib/homebridge-ai homebridge/homebridge:latest; docker rm homebridge-ai
```

Then open homebridge UI: http://localhost:18581/

---

## Link To Homebridge

Run this command so your global install of Homebridge can discover the plugin in your development environment:

```
npm link
```

You can now start Homebridge, use the `-D` flag so you can see debug log messages in your plugin:

```
homebridge -D
```

## Publish Package

When you are ready to publish your plugin to [npm](https://www.npmjs.com/), make sure you have removed the `private` attribute from the [`package.json`](./package.json) file then run:

```
npm publish
```

If you are publishing a scoped plugin, i.e. `@username/homebridge-xxx` you will need to add `--access=public` to command the first time you publish.

#### Publishing Beta Versions

You can publish _beta_ versions of your plugin for other users to test before you release it to everyone.

```bash
# create a new pre-release version (eg. 2.1.0-beta.1)
npm version prepatch --preid beta

# publish to @beta
npm publish --tag=beta
```

Users can then install the _beta_ version by appending `@beta` to the install command, for example:

```
sudo npm install -g homebridge-example-plugin@beta
```
