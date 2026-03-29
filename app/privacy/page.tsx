"use client";
import ReactMarkdown from "react-markdown";

const content = `# Tort Reborn Bot - Privacy Policy

**Last Updated:** March 23, 2026

## 1. Introduction

This Privacy Policy describes how Tort Reborn ("the Bot") collects, uses, stores, and shares your information when you interact with it on Discord.

## 2. Data We Collect

### 2.1 Discord Data
- **Discord User ID** - Used to link your Discord account to your Minecraft account and track profile customization, shell balances, and application history.
- **Discord Username** - Stored when you submit a guild application via the website.
- **Discord Avatar** - Temporarily used during the application process (not permanently stored by the Bot).

### 2.2 Minecraft / Wynncraft Data
- **Minecraft UUID and In-Game Name (IGN)** - Stored when you link your account. Used to fetch your stats from the Wynncraft API.
- **Gameplay Statistics** - Playtime, wars, raids, guild contributions, and other stats retrieved from the public Wynncraft API. Periodic snapshots are stored to calculate activity over time.

### 2.3 Guild Application Data
- **Application Answers** - When you apply to The Aquarium guild, your form responses (IGN, timezone, experience, etc.) are stored to process your application.
- **Application Status** - Whether your application was accepted, denied, or is pending.
- **Vote Records** - Guild staff votes on applications are recorded with voter IDs.

### 2.4 Profile Customization
- **Background Preferences** - Your selected profile card background and owned backgrounds.
- **Custom Gradients** - Color preferences for your profile card.

### 2.5 In-Game Economy
- **Shell Balance** - Your balance in the guild's internal currency system.

### 2.6 Message Content
The Bot reads message content **only** within guild application ticket channels to detect and validate applications. Message content is processed in real-time and **not permanently stored** - only parsed results (IGN, recruiter name, application type) are saved.

## 3. How We Use Your Data

- **Account Linking** - Connecting your Discord account to your Minecraft account for profile cards and stat tracking.
- **Guild Management** - Processing applications, tracking promotions, managing member roles.
- **Statistics & Leaderboards** - Generating activity leaderboards, profile cards, and progress displays.
- **Application Processing** - Reviewing and tracking guild applications.

## 4. Third-Party Services

We share limited data with the following third-party services:

### 4.1 Wynncraft API
- **Data Sent:** Minecraft UUIDs and usernames
- **Purpose:** Retrieving player and guild statistics
- **Note:** This data is already public on Wynncraft

### 4.2 OpenAI
- **Data Sent:** Application message text
- **Purpose:** Parsing application form responses to extract structured data (IGN, recruiter name)
- **Note:** Only application text is sent; no Discord IDs or other identifiers are included in the prompt

### 4.3 Google Sheets (via Google Apps Script)
- **Data Sent:** IGN, recruiter name, promotion status, application type
- **Purpose:** Recruiter tracking and guild management reporting
- **Note:** No Discord IDs are sent to Google Sheets

### 4.4 Visage API
- **Data Sent:** Minecraft UUID
- **Purpose:** Rendering Minecraft player skin/avatar images for profile cards

### 4.5 Supabase Storage (S3)
- **Data Stored:** Cached avatar images (3-day expiry), profile background images
- **Purpose:** Performance caching to reduce API calls

## 5. Data Storage & Security

- All data is stored in a PostgreSQL database hosted on Neon (cloud database provider).
- Database connections use SSL encryption.
- Separate databases are used for production and testing environments.
- Application tokens are cryptographically signed and expire after 30 minutes.

## 6. Data Retention

- **Account Links** - Retained as long as you are a guild member. Removed upon request.
- **Activity Snapshots** - Retained indefinitely for historical leaderboard tracking.
- **Application Records** - Retained indefinitely for guild management purposes.
- **Avatar Cache** - Automatically expires after 3 days.
- **Profile Customization** - Retained until you request removal or unlink your account.

## 7. Your Rights

You have the right to:
- **Access** - Request a copy of the data we store about you.
- **Deletion** - Request deletion of your data by contacting a guild administrator. This includes your account link, profile customization, shell balance, and application records.
- **Correction** - Request corrections to inaccurate data.
- **Unlinking** - Unlink your Discord and Minecraft accounts at any time via the \`/manage unlink\` command (in authorized servers).

To exercise these rights, contact a guild administrator in The Aquarium Discord server.

## 8. Data for Non-Members

If you use the Bot via user-install or in an external server, the Bot does **not** store any data about you unless you voluntarily link your account. Public commands (like \`/profile\` or \`/online\`) only query the Wynncraft API using the player name you provide and do not create any stored records tied to your Discord account.

## 9. Children's Privacy

We do not knowingly collect data from users under 13. Discord's Terms of Service require users to be at least 13 years old.

## 10. Changes to This Policy

We may update this Privacy Policy at any time. Continued use of the Bot after changes constitutes acceptance of the updated policy.

## 11. Contact

For privacy-related questions or data requests, contact the Tort Reborn development team through The Aquarium Discord server.`;

export default function PrivacyPage() {
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
