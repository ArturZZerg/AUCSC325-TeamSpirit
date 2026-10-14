# A separate disposable XCTest host; never change CampusFlow's application target.
require 'fileutils'
require 'xcodeproj'

abort 'Public acceptance requires the disposable macOS Actions runner.' unless
  RUBY_PLATFORM.include?('darwin') && ENV['GITHUB_ACTIONS'] == 'true' && ENV['RUNNER_OS'] == 'macOS'

root = File.expand_path('..', __dir__)
directory = File.join(root, '.local', 'ios-public-project')
commit = ENV.fetch('CAMPUSFLOW_BUILD_SHA')
udid = ENV.fetch('IOS_SIMULATOR_UDID')
run_id = ENV.fetch('GITHUB_RUN_ID')
attempt = ENV.fetch('GITHUB_RUN_ATTEMPT')
abort 'Invalid public acceptance build context.' unless
  commit.match?(/\A[0-9a-f]{40}\z/i) && udid.match?(/\A[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\z/i) &&
  run_id.match?(/\A[1-9][0-9]*\z/) && attempt.match?(/\A[1-9][0-9]*\z/)
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

project = Xcodeproj::Project.new(File.join(directory, 'PublicAcceptance.xcodeproj'))
host = project.new_target(:application, 'ProbeHost', :ios, '16.4')
tests = project.new_target(:ui_test_bundle, 'PublicAcceptanceTests', :ios, '16.4')
host.source_build_phase.add_file_reference(project.main_group.new_file(host_source))
tests.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, 'scripts', 'ios-public-acceptance.swift')))
context_source = File.join(directory, 'AcceptanceContext.swift')
File.write(context_source, "enum AcceptanceContext { static let value = #{[commit, udid, run_id, attempt].join('|').dump} }\n")
tests.source_build_phase.add_file_reference(project.main_group.new_file(context_source))
tests.add_dependency(host)
[host, tests].each do |target|
  target.build_configurations.each do |configuration|
    configuration.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER' => "com.campusflow.nativeacceptance.#{target.name.downcase}",
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
scheme.save_as(project.path, 'PublicAcceptanceTests')
puts 'Disposable public acceptance project generated; CampusFlow product unchanged.'
