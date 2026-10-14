import Foundation
import XCTest

final class InputComparisonTests: XCTestCase {
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
    func testFirstWarmHelpAndSingleBack() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.campusflow.mobile")
        app.launch()
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(app.state, .runningForeground)
        let initialPID = try processID(app)
        print("CAMPUSFLOW_PUBLIC_PID_BEFORE=\(initialPID)")

        // First incoming Help link precedes every in-app Help action.
        app.open(try XCTUnwrap(URL(string: "campusflow:///help")))
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 45))
        XCTAssertEqual(try processID(app), initialPID, "A cold replacement cannot pass the warm-link comparison.")
        let back = app.buttons["Back to sign in"]
        XCTAssertTrue(back.waitForExistence(timeout: 10))
        XCTAssertTrue(back.isHittable)
        let firstHelp = XCTAttachment(screenshot: app.screenshot())
        firstHelp.name = "first-warm-help"
        firstHelp.lifetime = .keepAlways
        add(firstHelp)
        print("CAMPUSFLOW_PUBLIC_WARM_HELP_BEFORE_BACK")

        back.tap() // One ordinary public XCTest tap, without retry or long press.
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(try processID(app), initialPID)
        let help = app.buttons["Help & data"]
        XCTAssertTrue(help.isHittable)
        print("CAMPUSFLOW_PUBLIC_SINGLE_BACK_COMPLETED")

        help.tap()
        XCTAssertTrue(label("A little help for your day.", in: app).waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Back to sign in"].isHittable)
        app.buttons["Back to sign in"].tap()
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(try processID(app), initialPID)
        print("CAMPUSFLOW_PUBLIC_IN_APP_HELP_AND_BACK_COMPLETED")
    }
}
