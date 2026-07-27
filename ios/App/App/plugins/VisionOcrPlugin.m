#import <Capacitor/Capacitor.h>
#import <Foundation/Foundation.h>

// Exposed to JavaScript as registerPlugin('VisionOcr').
CAP_PLUGIN(VisionOcrPlugin, "VisionOcr",
           CAP_PLUGIN_METHOD(recognizeText, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(supportedLanguages, CAPPluginReturnPromise);
)
