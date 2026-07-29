require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# Packaging the plugins as a pod is what removes the manual step. Capacitor's
# `cap sync` finds this package (via the "capacitor" key in package.json), adds a
# pod entry pointing here, and CocoaPods compiles the Swift into the Pods project.
# Dropping the files loose into ios/App/App/ instead would require adding them to
# the Xcode target by hand — impossible without a Mac, and a silent runtime failure
# if forgotten.
Pod::Spec.new do |s|
  s.name = 'BooknotesNative'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'MIT'
  s.homepage = 'https://github.com/ShiviTheGod/booknotes'
  s.author = 'ShiviTheGod'
  s.source = { :git => 'https://github.com/ShiviTheGod/booknotes.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
