# homebridge-automation

Control and automate your Homebridge instance with Javascript.

> [!WARNING]
> This plugin is very new, but since it's so useful and unique (no simpler homebridge automation approaches exist) I'm releasing it for constributors, testers, and as a request for feedback.

Any time a device/service status changes, a callback registered at `automation.listen` will fire with an `event` shaped like a (Service)[https://github.com/grrowl/homebridge-plugin-automation/blob/main/src/schemas/Service.ts]. This allows you to build automations without setting up Node-RED or other third-party solutions.

## Examples

```js
automation.listen(function (event) {
  if (event.type === "Lightbulb") {
    // Some lightbulb changed state
  }
  if (event.serviceName === "Book Globe") {
    // A specific device/service changed state
  }
});
```

When Dummy Switch is turned on, wait 5 seconds, then turn it Off.

```js
automation.listen(function (event) {
  if (event.serviceName === "Dummy Switch") {
    const On = event.serviceCharacteristics.find((c) => c.serviceName === "On");

    if (On && On.value === 1) {
      setTimeout(function () {
        automation.set(event.uniqueId, On.iid, 0);
      }, 5_000);
      return true;
    }
    return false;
  }
  return null;
});
```

On Motion sensor updating, check if it's Active, if so, turn on the lamp.

```js
automation.listen(function (event) {
  if (event.serviceName === "Motion sensor") {
    if (
      event.serviceCharacteristics.find(
        (c) => c.type === "MotionDetected" && c.value === 1,
      )
    ) {
      // Find the light we want
      const light = automation.services.find(
        (s) => s.serviceName === "Tall Lamp",
      );
      if (light) {
        const on = light.serviceCharacteristics.find((s) => s.type === "On");
        if (on) {
          automation.set(light.uniqueId, on.iid, 1);
        }
      }
    }
  }
});
```

## API

The `automation` object is available in your function module scope and defined in [`platformApi.ts`](https://github.com/grrowl/homebridge-plugin-automation/blob/main/src/platformApi.ts).

See [`schemas/Service.ts`](https://github.com/grrowl/homebridge-plugin-automation/blob/main/src/schemas/Service.ts) and [`schemas/Characteristic.ts`](https://github.com/grrowl/homebridge-plugin-automation/blob/main/src/schemas/Characteristic.ts).

Your function module scope is preserved between invocations, but is lost on Homebridge restart.

## Troubleshooting

Turn on "Homebridge Debug Mode" to see the return values from your functions in the logs (helpful for debugging).

Homebridge (or the bridge homebridge-automation runs on) needs to be restarted for changes to the automation javascript to take effect.

You might need "Homebridge 'Insecure' Mode (Enable Accessory Control)" enabled.

Note your `serviceName` may not be the same as the Accessory name! Click the gear on your accessory and check the "Name" listed in the table -- that is the true `serviceName` exposed to the automation.

## Development

### Local testing

Simply run `npm run watch` to start. By default it uses the config at `~/.homebridge/config.json`, so if you want to discover local network instance add the correct PIN for your Homebridge instance there.

### Local testing (in docker)

This runs segregated from your local network for more specific testing scenarios.

```shell
docker run --name=homebridge-automation -p 18581:8581 -v $(pwd)/homebridge:/homebridge -v $(pwd):/var/lib/homebridge-plugin-automation homebridge/homebridge:latest; docker rm homebridge-automation
```

Then open homebridge UI: http://localhost:18581/

Note: because of our use of `isolated-vm`, linking your host node_modules/dist into a docker container of a different arch (e.g. arm64 or x86) won't work, with error "invalid ELF header"

---

### Link To Homebridge

Run this command so your global install of Homebridge can discover the plugin in your development environment:

```
npm link
```

You can now start Homebridge, use the `-D` flag so you can see debug log messages in your plugin:

```
homebridge -D
```

### Installing Beta Versions

You can install _beta_ versions of this plugin by appending `@beta` to the install command, for example:

```
sudo npm install -g homebridge-example-plugin@beta
```

Beta versions may break functionality, but
