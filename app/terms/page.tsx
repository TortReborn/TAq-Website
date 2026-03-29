"use client";
import ReactMarkdown from "react-markdown";

const content = `# Tort Reborn Bot - Terms of Service

**Last Updated:** March 23, 2026

## 1. Acceptance of Terms

By adding Tort Reborn ("the Bot") to your Discord server or installing it to your Discord account, you agree to these Terms of Service. If you do not agree, do not use the Bot.

## 2. Description of Service

Tort Reborn is a Discord bot built for the Wynncraft gaming community. It provides:
- Player and guild statistics from the Wynncraft API
- Territory maps, raid rankings, and leaderboards
- Guild member management tools (in authorized servers only)
- Profile cards and progress tracking
- Guild application processing (in authorized servers only)

## 3. User-Installable App

When installed to your Discord account ("Add to My Apps"), the Bot provides a limited set of public commands (such as player lookups, world lists, and territory maps) that can be used in DMs, group DMs, or any server. Administrative and management commands are only available in the Bot's home servers.

## 4. Eligibility

There are no age restrictions beyond Discord's own Terms of Service. By using the Bot, you confirm you are in compliance with Discord's Terms of Service.

## 5. Acceptable Use

You agree not to:
- Abuse, exploit, or spam the Bot's commands
- Attempt to access administrative commands outside of authorized servers
- Use the Bot to harass, impersonate, or harm other users
- Reverse-engineer, decompile, or attempt to extract the Bot's source code
- Use automated scripts or tools to interact with the Bot at excessive rates

## 6. Guild Management Features

Certain features (member management, applications, rank promotions, aspect distribution) are restricted to The Aquarium [TAq] guild's authorized Discord servers. These features require appropriate Discord permissions and are not available in external servers or via user-install.

## 7. Rate Limiting

Commands used in external servers or via user-install are subject to per-user and per-guild rate limits to prevent abuse. Exceeding these limits will temporarily restrict your access to the Bot's commands.

## 8. Availability

The Bot is provided "as is" with no guarantees of uptime or availability. We may modify, suspend, or discontinue the Bot at any time without notice.

## 9. Data Collection

Please refer to our [Privacy Policy](/privacy) for information about how we collect, use, and protect your data.

## 10. Limitation of Liability

The Bot is provided without warranty of any kind. We are not responsible for any damages, data loss, or issues arising from the use of the Bot. Game data is sourced from the Wynncraft API and may not always be accurate or up to date.

## 11. Changes to Terms

We may update these Terms at any time. Continued use of the Bot after changes constitutes acceptance of the new Terms.

## 12. Contact

For questions or concerns about these Terms, contact the Tort Reborn development team through The Aquarium Discord server.`;

export default function TermsPage() {
  return (
    <div style={{
      maxWidth: "800px",
      margin: "0 auto",
      padding: "2rem 1.5rem",
      color: "var(--text-primary)",
      lineHeight: 1.7,
    }}>
      <div className="markdown-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
