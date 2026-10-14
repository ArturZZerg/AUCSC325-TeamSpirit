import Foundation
import XCTest

final class NativePublicAcceptanceTests: XCTestCase {
    @MainActor
    private func processID(_ app: XCUIApplication) throws -> Int {
        let description = app.debugDescription as NSString
        let pattern = try NSRegularExpression(pattern: #"pid:\s*(\d+)"#)
        let match = try XCTUnwrap(pattern.firstMatch(in: description as String,
                                                    range: NSRange(location: 0, length: description.length)),
                                  "Native process identity is unavailable; warm acceptance is unproven.")
        let value = try XCTUnwrap(Int(description.substring(with: match.range(at: 1))))
        XCTAssertGreaterThan(value, 0)
        return value
    }

    @MainActor
    private func label(_ value: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", value)).firstMatch
    }

    @MainActor
    private func open(_ value: String) throws {
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: value)))
        // Preserve the conditional system confirmation when this OS presents it.
        // Only inspect a foreground system host; never activate a browser.
        for bundle in ["com.apple.springboard", "com.apple.mobilesafari"] {
            let host = XCUIApplication(bundleIdentifier: bundle)
            if host.state == .runningForeground && host.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Open in", "CampusFlow")
            ).firstMatch.exists {
                let confirmation = host.buttons["Open"]
                XCTAssertTrue(confirmation.isHittable)
                confirmation.tap()
            }
        }
    }

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication, upwards: Bool = false) {
        for _ in 0..<8 {
            if element.exists && element.isHittable { return }
            if upwards { app.swipeDown() } else { app.swipeUp() }
        }
        XCTAssertTrue(element.exists && element.isHittable, "Required public control must be visible and reachable.")
    }

    @MainActor
    private func capture(_ name: String, in app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testPublicLinksAndNavigation() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_PUBLIC_CONTEXT=\(AcceptanceContext.value)")
        let app = XCUIApplication(bundleIdentifier: "com.campusflow.mobile")
        app.launch()
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(app.state, .runningForeground)
        let warmPID = try processID(app)
        print("CAMPUSFLOW_PUBLIC_INITIAL_PID=\(warmPID)")
        capture("ios-auth", in: app)

        // First incoming Help URL precedes every in-app Help action.
        try open("campusflow:///help")
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 45))
        XCTAssertEqual(try processID(app), warmPID, "A cold replacement cannot pass warm-link acceptance.")
        capture("ios-help-first-link", in: app)
        print("CAMPUSFLOW_PUBLIC_FIRST_WARM_HELP=\(warmPID)")
        let back = app.buttons["Back to sign in"]
        XCTAssertTrue(back.waitForExistence(timeout: 10))
        XCTAssertTrue(back.isHittable)
        back.tap()
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(try processID(app), warmPID)
        print("CAMPUSFLOW_PUBLIC_SINGLE_BACK=\(warmPID)")

        let help = app.buttons["Help & data"]
        XCTAssertTrue(help.isHittable)
        help.tap()
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Back to sign in"].isHittable)
        app.buttons["Back to sign in"].tap()
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(try processID(app), warmPID)
        print("CAMPUSFLOW_PUBLIC_IN_APP_HELP=\(warmPID)")

        try open("campusflow://help")
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 30))
        let search = app.textFields["Search help"]
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        capture("ios-help", in: app)
        search.tap()
        // The installed single-line input blurs/submits on Return, with either
        // software or hardware keyboard presentation.
        search.typeText("offline\n")
        let question = app.buttons["What can I do without a connection?"]
        reveal(question, in: app)
        question.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Previously saved information can be read")).firstMatch.waitForExistence(timeout: 30))
        capture("ios-help-offline-answer", in: app)
        let clear = app.buttons["Clear search"]
        reveal(clear, in: app, upwards: true)
        clear.tap()
        let cleared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: clear)
        XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 10), .completed)
        XCTAssertEqual(try processID(app), warmPID)
        print("CAMPUSFLOW_PUBLIC_LEGACY_HELP_SEARCH=\(warmPID)")

        try open("campusflow:///account")
        XCTAssertTrue(label("Sign in to manage your account", in: app).waitForExistence(timeout: 30))
        try open("campusflow:///help?next=https%3A%2F%2Funtrusted.test")
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertEqual(try processID(app), warmPID)
        print("CAMPUSFLOW_PUBLIC_ACCOUNT_AND_CONTINUATION=\(warmPID)")

        app.terminate()
        XCTAssertEqual(app.state, .notRunning)
        // No launch/reset precedes the cold incoming URL.
        try open("campusflow:///help")
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 30))
        let coldPID = try processID(app)
        XCTAssertNotEqual(coldPID, warmPID)
        XCTAssertEqual(app.state, .runningForeground)
        capture("ios-help-cold", in: app)
        print("CAMPUSFLOW_PUBLIC_COLD_HELP=\(coldPID)")
        print("CAMPUSFLOW_PUBLIC_ACCEPTANCE_COMPLETE")
    }
}
