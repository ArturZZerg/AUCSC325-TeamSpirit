import Foundation
import XCTest

// Credentials and all XCTest logs/results stay in this job's private .local tree.
// Publish fixed stage markers only; assertions never interpolate field values.
final class NativePrivateLoginTests: XCTestCase {
    @MainActor
    private func label(_ value: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", value)).firstMatch
    }

    @MainActor
    private func typeChecked(_ value: String, into field: XCUIElement) {
        XCTAssertTrue(field.waitForExistence(timeout: 15), "Required input must exist.")
        XCTAssertTrue(field.isHittable, "Required input must be reachable.")
        field.tap()
        var prefix = ""
        for character in value {
            field.typeText(String(character))
            prefix.append(character)
            let expected = prefix
            let observed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                (field.value as? String) == expected
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [observed], timeout: 3), .completed,
                           "Each ordinary keystroke must reach the controlled input exactly once.")
        }
    }

    @MainActor
    private func keyboard(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.keyboards.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch
    }

    @MainActor
    func testOrdinaryNativeLogin() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_LOGIN_CONTEXT=\(PrivateLoginContext.value)")
        let app = XCUIApplication(bundleIdentifier: "com.campusflow.mobile")
        app.launch()
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "campusflow:///today")))
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
        XCTAssertTrue(label("Welcome back", in: app).waitForExistence(timeout: 45))
        XCTAssertEqual(app.state, .runningForeground)
        typeChecked(PrivateLoginContext.email, into: app.textFields["auth-email"])
        let next = keyboard("Next", in: app)
        XCTAssertTrue(next.waitForExistence(timeout: 10) && next.isHittable)
        next.tap()
        let goAfterNext = keyboard("Go", in: app)
        XCTAssertTrue(goAfterNext.waitForExistence(timeout: 10), "Email Return must focus the password keyboard.")
        print("CAMPUSFLOW_LOGIN_EMAIL_AND_NEXT")

        // The ordinary visibility control lets the harness verify each character
        // without accepting dropped/duplicated secure-field driver input.
        let show = app.buttons["Show password"]
        XCTAssertTrue(show.isHittable)
        show.tap()
        typeChecked(PrivateLoginContext.password, into: app.textFields["auth-password"])
        let hide = app.buttons["Hide password"]
        XCTAssertTrue(hide.isHittable)
        hide.tap()
        let secure = app.secureTextFields["auth-password"]
        XCTAssertTrue(secure.waitForExistence(timeout: 10) && secure.isHittable)
        secure.tap()
        print("CAMPUSFLOW_LOGIN_PASSWORD_AND_HIDE")
        let go = keyboard("Go", in: app)
        XCTAssertTrue(go.waitForExistence(timeout: 10) && go.isHittable)
        go.tap()

        // The system password sheet may cover the app's accessibility tree.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let today = label("Your daily flow", in: app)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            today.exists || springboard.buttons["Not Now"].exists || app.buttons["Not Now"].exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        for host in [springboard, app] {
            let notNow = host.buttons["Not Now"]
            if notNow.exists && notNow.isHittable { notNow.tap() }
        }
        XCTAssertTrue(today.waitForExistence(timeout: 15))
        XCTAssertEqual(app.state, .runningForeground)
        print("CAMPUSFLOW_LOGIN_TODAY")
        print("CAMPUSFLOW_LOGIN_COMPLETE")
    }
}
