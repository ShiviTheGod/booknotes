#import <Capacitor/Capacitor.h>
#import <Foundation/Foundation.h>

// Registers SpeechPlugin with Capacitor's bridge under the name "Speech", which is
// what registerPlugin('Speech') resolves to on the JavaScript side. Swift plugins
// still need this Objective-C macro to be discoverable at runtime.
CAP_PLUGIN(SpeechPlugin, "Speech",
           CAP_PLUGIN_METHOD(checkPermissions, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(available, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
)
