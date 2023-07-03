import { API } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { HomebridgeAI } from './platform';
import _debug from 'debug';

const debug = _debug(PLUGIN_NAME);

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  debug('hello!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  api.registerPlatform(PLATFORM_NAME, HomebridgeAI);
};
