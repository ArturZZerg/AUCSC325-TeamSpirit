# Disposable UI-test host only. Never alter the CampusFlow product or upload this
# generated project, credentials, derived data, XCTest log, or result bundle.
require 'fileutils'
require 'json'
require 'xcodeproj'

abort 'Private login requires the disposable macOS Actions runner.' unless
  RUBY_PLATFORM.include?('darwin') && ENV['GITHUB_ACTIONS'] == 'true' && ENV['RUNNER_OS'] == 'macOS'
root = File.expand_path('..', __dir__)
directory = File.realpath(ARGV.fetch(0))
parent = File.realpath(File.join(root, '.local'))
abort 'Invalid private login directory.' unless File.dirname(directory) == parent &&
  File.basename(directory).match?(/\Aios-storage-[0-9a-f-]{36}\z/)
context = JSON.parse(File.read(File.join(directory, 'login-context.json')))
abort 'Invalid private login context.' unless context.keys.sort == %w[attempt commit email password runId udid].sort &&
  context['commit'].match?(/\A[0-9a-f]{40}\z/i) && context['udid'].match?(/\A[0-9a-f-]{36}\z/i) &&
  context['runId'].match?(/\A[1-9][0-9]*\z/) && context['attempt'].match?(/\A[1-9][0-9]*\z/) &&
  context['email'].match?(/\Aios-[0-9a-f-]{36}@example\.test\z/) && context['password'].match?(/\A[0-9a-f]{48}\z/)

host_source = File.join(directory, 'LoginHost.swift')
File.write(host_source, <<~SWIFT)
  import UIKit
  @main final class LoginHost: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
      window = UIWindow(frame: UIScreen.main.bounds)
      window?.rootViewController = UIViewController()
      window?.makeKeyAndVisible()
      return true
    }
  }
SWIFT
context_source = File.join(directory, 'PrivateLoginContext.swift')
File.write(context_source, <<~SWIFT)
  enum PrivateLoginContext {
    static let value = #{%w[commit udid runId attempt].map { |key| context.fetch(key) }.join('|').dump}
    static let email = #{context.fetch('email').dump}
    static let password = #{context.fetch('password').dump}
  }
SWIFT
project = Xcodeproj::Project.new(File.join(directory, 'PrivateLogin.xcodeproj'))
host = project.new_target(:application, 'LoginHost', :ios, '16.4')
tests = project.new_target(:ui_test_bundle, 'PrivateLoginTests', :ios, '16.4')
host.source_build_phase.add_file_reference(project.main_group.new_file(host_source))
[File.join(root, 'scripts', 'ios-private-login.swift'), context_source].each do |source|
  tests.source_build_phase.add_file_reference(project.main_group.new_file(source))
end
tests.add_dependency(host)
[host, tests].each do |target|
  target.build_configurations.each do |configuration|
    configuration.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER' => "com.campusflow.privatelogin.#{target.name.downcase}",
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
scheme.save_as(project.path, 'PrivateLoginTests')
puts 'Private native login host generated; CampusFlow product unchanged.'
