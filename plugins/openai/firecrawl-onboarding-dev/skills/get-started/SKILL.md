---
name: get-started
description: Guide first-time setup of the Firecrawl plugin, including its account connection, source selection, and first request in chat. Use for plugin onboarding or when the user asks to get started with Firecrawl sources.
---

Help the user choose useful Alexandria sources and ask their first question.

The plugin's fullscreen sidebar app contains the visual setup. Ask the user to open **Firecrawl Onboarding Dev → Open app** from Plugins; it shows onboarding on first open. A returning user can choose **Manage sources** to revisit the source picker.

The Welcome step checks the existing Firecrawl connection and shows credits. If connection setup is required, direct the user to the plugin's connection settings. Never ask for credentials in chat or put them in app context. This local development package uses the existing macOS Keychain setup.

The source picker supports whole providers and individual tools. Selection is a draft until the user chooses **Add sources to chat**. That action attaches provider context to the native composer without sending a message or running paid capabilities. Selections are preferences, not separate logins to provider accounts or an exclusive execution allowlist.

After sources are attached, invite the user to type their task in the native chat composer. If they have already supplied a task, continue with the selected sources and available Firecrawl tools. Read the live capability contracts before execution and follow any required access or terms steps. Do not execute capabilities merely to demonstrate setup.

Saved choices are local to this host when storage is available. In a new chat, **Add to this chat** attaches saved sources explicitly; saved preferences do not mean sources are already attached. The app reports unsupported context attachment or blocked storage rather than claiming success.
