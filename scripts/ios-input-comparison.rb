# Generate only a disposable XCTest host/project; never alter CampusFlow's app.
require 'fileutils'
require 'xcodeproj'

abort 'Comparison requires the disposable macOS Actions runner.' unless
  RUBY_PLATFORM.include?('darwin') && ENV['GITHUB_ACTIONS'] == 'true' && ENV['RUNNER_OS'] == 'macOS'

root = File.expand_path('..', __dir__)
directory = File.join(root, '.local', 'ios-input-project')
FileUtils.mkdir_p(directory)
host_source = File.join(directory, 'ProbeHost.swift')
File.write(host_source, <<~SWIFT)
  import UIKit
  @main final class ProbeHost: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
      window = UIWindow(frame: UIScreen.main.bounds)
      window?.rootViewController = UIViewController()
      window?.makeKeyAndVisible()
      return true
    }
  }
SWIFT

project = Xcodeproj::Project.new(File.join(directory, 'InputComparison.xcodeproj'))
host = project.new_target(:application, 'ProbeHost', :ios, '16.4')
tests = project.new_target(:ui_test_bundle, 'InputComparisonTests', :ios, '16.4')
host.source_build_phase.add_file_reference(project.main_group.new_file(host_source))
tests.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, 'scripts', 'ios-input-comparison.swift')))
tests.add_dependency(host)

[host, tests].each do |target|
  target.build_configurations.each do |configuration|
    configuration.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER' => "com.campusflow.inputcomparison.#{target.name.downcase}",
      'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.0',
      'TARGETED_DEVICE_FAMILY' => '1', 'CODE_SIGN_IDENTITY' => '-',
      'CODE_SIGNING_ALLOWED' => 'YES', 'DEVELOPMENT_TEAM' => '',
      'ENABLE_TESTING_SEARCH_PATHS' => 'YES'
    })
  end
end
tests.build_configurations.each { |configuration| configuration.build_settings['TEST_TARGET_NAME'] = host.name }
project.root_object.attributes['TargetAttributes'] = { tests.uuid => { 'TestTargetID' => host.uuid } }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(host, tests, launch_target: true)
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project.path, 'InputComparisonTests')
puts 'Disposable input comparison project generated; CampusFlow product unchanged.'
