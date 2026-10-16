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
    private func processID(_ app: XCUIApplication) throws -> Int {
        let description = app.debugDescription as NSString
        let pattern = try NSRegularExpression(pattern: #"pid:\s*(\d+)"#)
        let match = try XCTUnwrap(pattern.firstMatch(in: description as String,
            range: NSRange(location: 0, length: description.length)), "Actual native process identity required.")
        let pid = try XCTUnwrap(Int(description.substring(with: match.range(at: 1))))
        XCTAssertGreaterThan(pid, 0)
        return pid
    }

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "The owned cached task must be reachable.")
    }

    @MainActor
    private func revealCoursework(_ element: XCUIElement, in app: XCUIApplication, towardTop: Bool = false) {
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.exists, "The coursework scroll view must exist.")
        for _ in 0..<8 {
            if element.exists && element.isHittable { return }
            if towardTop { scroll.swipeDown() } else { scroll.swipeUp() }
        }
        XCTAssertTrue(element.exists && element.isHittable, "The coursework control must be reachable.")
    }

    @MainActor
    private func replaceChecked(_ value: String, into field: XCUIElement, in app: XCUIApplication) {
        revealCoursework(field, in: app, towardTop: true)
        // These short synthetic values fit the ordinary input. Tap its right
        // edge to put the caret after the text, then observe every deletion.
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        guard let initial = field.value as? String else {
            XCTFail("The controlled input must expose its value.")
            return
        }
        var remaining = initial == field.placeholderValue ? "" : initial
        while !remaining.isEmpty {
            field.typeText(XCUIKeyboardKey.delete.rawValue)
            remaining.removeLast()
            let expected = remaining
            let observed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                let actual = field.value as? String
                return actual == expected || expected.isEmpty && actual == field.placeholderValue
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [observed], timeout: 3), .completed,
                           "Each ordinary deletion must update the controlled input.")
        }
        typeChecked(value, into: field)
        let returnKey = keyboard("Return", in: app)
        let done = keyboard("Done", in: app)
        if returnKey.exists && returnKey.isHittable { returnKey.tap() }
        else {
            XCTAssertTrue(done.exists && done.isHittable, "The ordinary keyboard dismissal must be reachable.")
            done.tap()
        }
    }

    @MainActor
    private func courseworkApp() throws -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "com.campusflow.mobile")
        app.launch()
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "campusflow:///academics")))
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
        XCTAssertTrue(label("Stay ahead of deadlines.", in: app).waitForExistence(timeout: 30))
        XCTAssertFalse(label("Welcome back", in: app).exists)
        return app
    }

    @MainActor
    private func editCoursework(_ title: String, in app: XCUIApplication) {
        revealCoursework(label(title, in: app), in: app)
        let edit = app.buttons["Edit"]
        revealCoursework(edit, in: app)
        edit.tap()
        XCTAssertTrue(label("Update your deadline.", in: app).waitForExistence(timeout: 15))
        XCTAssertEqual(app.textFields["Coursework title"].value as? String, title)
    }

    @MainActor
    private func saveCoursework(in app: XCUIApplication, creating: Bool = false) {
        let save = app.buttons[creating ? "Add coursework" : "Save coursework"]
        revealCoursework(save, in: app)
        XCTAssertTrue(save.isEnabled)
        save.tap()
        let message = creating ? "Coursework added. You can plan study time from it below." : "Coursework updated."
        XCTAssertTrue(label(message, in: app).waitForExistence(timeout: 30))
        XCTAssertFalse(label("Update your deadline.", in: app).exists)
        XCTAssertFalse(label("One less thing to remember.", in: app).exists)
    }

    @MainActor
    func testCourseworkNoOpAndCancel() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_COURSEWORK_CANCEL_CONTEXT=\(PrivateLoginContext.value)")
        let app = try courseworkApp()
        editCoursework(PrivateLoginContext.academicTitle, in: app)
        print("CAMPUSFLOW_COURSEWORK_CANCEL_OPENED")
        let save = app.buttons["Save coursework"]
        revealCoursework(save, in: app)
        XCTAssertFalse(save.isEnabled)
        XCTAssertTrue(label("No changes to save.", in: app).exists)
        print("CAMPUSFLOW_COURSEWORK_CANCEL_NO_OP")
        replaceChecked(PrivateLoginContext.editedAcademicTitle, into: app.textFields["Coursework title"], in: app)
        let cancel = app.buttons["Cancel"]
        revealCoursework(cancel, in: app, towardTop: true)
        cancel.tap()
        XCTAssertTrue(label("Stay ahead of deadlines.", in: app).waitForExistence(timeout: 15))
        revealCoursework(label(PrivateLoginContext.academicTitle, in: app), in: app)
        XCTAssertFalse(label(PrivateLoginContext.editedAcademicTitle, in: app).exists)
        print("CAMPUSFLOW_COURSEWORK_CANCEL_CANCELLED")
        app.terminate()
        XCTAssertEqual(app.state, .notRunning)
        print("CAMPUSFLOW_COURSEWORK_CANCEL_COMPLETE")
    }

    @MainActor
    func testCourseworkTitleSave() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_COURSEWORK_TITLE_CONTEXT=\(PrivateLoginContext.value)")
        let app = try courseworkApp()
        editCoursework(PrivateLoginContext.academicTitle, in: app)
        print("CAMPUSFLOW_COURSEWORK_TITLE_OPENED")
        replaceChecked(PrivateLoginContext.editedAcademicTitle, into: app.textFields["Coursework title"], in: app)
        print("CAMPUSFLOW_COURSEWORK_TITLE_TITLE_CHANGED")
        saveCoursework(in: app)
        print("CAMPUSFLOW_COURSEWORK_TITLE_SAVED")
        app.terminate()
        XCTAssertEqual(app.state, .notRunning)
        print("CAMPUSFLOW_COURSEWORK_TITLE_COMPLETE")
    }

    @MainActor
    func testCourseworkDeadlineClear() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_COURSEWORK_CLEAR_CONTEXT=\(PrivateLoginContext.value)")
        let app = try courseworkApp()
        editCoursework(PrivateLoginContext.editedAcademicTitle, in: app)
        print("CAMPUSFLOW_COURSEWORK_CLEAR_OPENED")
        let none = label("No deadline", in: app)
        revealCoursework(none, in: app)
        none.tap()
        print("CAMPUSFLOW_COURSEWORK_CLEAR_DEADLINE_CLEARED")
        saveCoursework(in: app)
        print("CAMPUSFLOW_COURSEWORK_CLEAR_SAVED")
        app.terminate()
        XCTAssertEqual(app.state, .notRunning)
        print("CAMPUSFLOW_COURSEWORK_CLEAR_COMPLETE")
    }

    @MainActor
    func testCourseworkCreation() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_COURSEWORK_CREATE_CONTEXT=\(PrivateLoginContext.value)")
        let app = try courseworkApp()
        let add = app.buttons["Add coursework"]
        revealCoursework(add, in: app, towardTop: true)
        add.tap()
        XCTAssertTrue(label("One less thing to remember.", in: app).waitForExistence(timeout: 15))
        print("CAMPUSFLOW_COURSEWORK_CREATE_OPENED")
        replaceChecked(PrivateLoginContext.createdAcademicTitle, into: app.textFields["Coursework title"], in: app)
        let quiz = label("Quiz", in: app)
        revealCoursework(quiz, in: app)
        quiz.tap()
        let day = label("Day only", in: app)
        revealCoursework(day, in: app)
        day.tap()
        replaceChecked(PrivateLoginContext.academicDate, into: app.textFields["Deadline date"], in: app)
        print("CAMPUSFLOW_COURSEWORK_CREATE_DRAFT_READY")
        saveCoursework(in: app, creating: true)
        print("CAMPUSFLOW_COURSEWORK_CREATE_SAVED")
        app.terminate()
        XCTAssertEqual(app.state, .notRunning)
        print("CAMPUSFLOW_COURSEWORK_CREATE_COMPLETE")
    }

    @MainActor
    func testOfflineRecovery() throws {
        continueAfterFailure = false
        print("CAMPUSFLOW_OFFLINE_CONTEXT=\(PrivateLoginContext.value)")
        let app = XCUIApplication(bundleIdentifier: "com.campusflow.mobile")
        app.launch()
        XCTAssertTrue(label("Your daily flow", in: app).waitForExistence(timeout: 30))
        XCTAssertFalse(label("Welcome back", in: app).exists)
        reveal(label(PrivateLoginContext.task, in: app), in: app)
        let pid = try processID(app)
        print("CAMPUSFLOW_OFFLINE_RESTORED")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "campusflow:///unavailable-link")))
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
        XCTAssertTrue(label("This page isn’t available.", in: app).waitForExistence(timeout: 30))
        XCTAssertEqual(try processID(app), pid, "Incoming recovery must retain the restored process.")
        print("CAMPUSFLOW_OFFLINE_UNAVAILABLE")
        let back = app.buttons["Back to Today"]
        XCTAssertTrue(back.waitForExistence(timeout: 10) && back.isHittable)
        back.tap()
        XCTAssertTrue(label("Your daily flow", in: app).waitForExistence(timeout: 30))
        reveal(label(PrivateLoginContext.task, in: app), in: app)
        XCTAssertEqual(try processID(app), pid, "Recovery must return to the same process and cached task.")
        XCTAssertEqual(app.state, .runningForeground)
        print("CAMPUSFLOW_OFFLINE_RETURNED")
        app.terminate()
        XCTAssertEqual(app.state, .notRunning)
        print("CAMPUSFLOW_OFFLINE_COMPLETE")
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
