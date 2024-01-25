# homebridge-automation

Control your homebridge instance with Javascript functions.

## Local testing

Simply run `npm run watch` to start. By default it uses the config at `~/.homebridge/config.json`, so if you want to discover local network instance add the correct PIN for your Homebridge instance there.

## Local testing (in docker)

This runs segregated from your local network for more specific testing scenarios.

```shell
docker run --name=homebridge-automation -p 18581:8581 -v $(pwd)/homebridge:/homebridge -v $(pwd):/var/lib/homebridge-automation homebridge/homebridge:latest; docker rm homebridge-automation
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

#### Installing Beta Versions

You can install _beta_ versions of this plugin by appending `@beta` to the install command, for example:

```
sudo npm install -g homebridge-example-plugin@beta
```

Beta versions may break functionality, but
