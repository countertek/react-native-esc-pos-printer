Pod::Spec.new do |s|
  s.name           = 'ReactNativeEscPosPrinter'
  s.version        = '0.1.0'
  s.summary        = 'Expo module for Epson TM ESC/POS printers'
  s.description    = 'Expo module for Epson TM ESC/POS printers'
  s.author         = 'countertek'
  s.homepage       = 'https://github.com/countertek/react-native-esc-pos-printer'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = 'ReactNativeEscPosPrinterModule.swift'
  s.vendored_frameworks = 'Frameworks/libepos2.xcframework'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
