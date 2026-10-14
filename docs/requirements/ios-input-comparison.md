# Public native input comparison

This is a temporary, fixed-source diagnostic, not a replacement acceptance gate.
Main `c08a098` and recovery `71e8082` both fail the first Help assertion before
recovery/private scenarios. In each, iOS delivers the URL only after automation
is disabled. Earlier Back failures separately show cancelled injected touches.
Repeated blind retries do not resolve that boundary.

Download the exact existing main simulator product from run `38612589080`, verify
its source, signature and identity, and install it on a fresh job-owned simulator.
Generate a separate minimal XCTest host using the runner's default Ruby and its
existing CocoaPods xcodeproj gem, with explicit runtime/gem capability checks.
CampusFlow's application binary, JS, source, entitlement namespace and
API configuration are not modified. Hash both executable and JS before/after.

The public-only test requires the ordinary sign-in screen, an active app, then the first
three-slash Help URL through Apple's public `XCUIApplication.open` API before any
in-app Help action. It requires the same observed native process ID after Help
opens and after exactly one public XCTest Back tap. An API that silently relaunches
the app must fail this comparison. Then exercise in-app Help and one Back action.
No route hooks, action retries, longer application assertions or private account
data are introduced. A missing process ID is inconclusive failure, not acceptance.

Actual macOS compilation and execution remain required. Success would establish
only that this alternative public input path works for the tested subset. It does
not identify which upstream component caused the original failure or waive any
original public/cold/API/cache/logout/recovery/day-review gate. In particular, it
does not establish system confirmation, search, Account or cold-link behavior.
Retire this fixed-artifact diagnostic after it informs a reviewed permanent fix;
its seven-day artifact dependency is intentionally not a production workflow.

Primary API references:
- [Opening an application by URL](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/open(_:))
- [Native tap events](https://developer.apple.com/documentation/xcuiautomation/xcuielement/tap())
