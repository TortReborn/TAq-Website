import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STORAGE_ACCOUNT = 'GordLonner';

function authorizedAccount(request: NextRequest): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1].trim().toLocaleLowerCase('en-US') !== STORAGE_ACCOUNT.toLocaleLowerCase('en-US')) {
    return null;
  }
  return STORAGE_ACCOUNT;
}

function formatBalance(balance: number): string {
  return `${Math.floor(balance / 64)} stx + ${balance % 64} LE`;
}

async function postDiscordUpdate(entry: {
  balance: number;
  action: string;
  reason: string;
  author: string;
  timestamp: Date;
}): Promise<boolean> {
  const webhookUrl = process.env.LE_BALANCE_DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'Guild Funds Update',
          color: entry.action.trim().startsWith('-') ? 0xef4444 : 0x42c983,
          fields: [
            { name: 'Action', value: entry.action || 'No change', inline: true },
            { name: 'Updated Balance', value: formatBalance(entry.balance), inline: true },
            { name: 'Reason', value: entry.reason || 'N/A', inline: false },
            { name: 'Author', value: entry.author, inline: false },
          ],
          timestamp: entry.timestamp.toISOString(),
        }],
      }),
    });
    if (!response.ok) {
      console.error('LE balance Discord webhook failed:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('LE balance Discord webhook failed:', error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!authorizedAccount(request)) {
    return NextResponse.json({ success: false, error: 'Only GordLonner may read the guild balance.' }, { status: 403 });
  }

  try {
    const result = await getPool().query(
      `SELECT balance, created_at
       FROM le_balance_log
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const latest = result.rows[0];
    const balance = latest ? Number(latest.balance) : 0;
    return NextResponse.json({
      success: true,
      balance,
      formatted_balance: formatBalance(balance),
      updated_at: latest?.created_at ?? null,
    });
  } catch (error) {
    console.error('LE balance fetch error:', error);
    return NextResponse.json({ success: false, error: 'Could not read the guild balance.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const storageAccount = authorizedAccount(request);
  if (!storageAccount) {
    return NextResponse.json({ success: false, error: 'Only GordLonner may update the guild balance.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const balance = Number(body.balance);
  const previousBalance = body.previous_balance === null || body.previous_balance === undefined
    ? null
    : Number(body.previous_balance);
  const action = typeof body.action === 'string' ? body.action.trim().slice(0, 120) : '';
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, 500)
    : 'N/A';
  const author = typeof body.author === 'string' ? body.author.trim().slice(0, 80) : '';

  if (!Number.isInteger(balance) || balance < 0 || (previousBalance !== null && (!Number.isInteger(previousBalance) || previousBalance < 0))) {
    return NextResponse.json({ success: false, error: 'Balances must be non-negative whole LE amounts.' }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ success: false, error: 'Action is required.' }, { status: 400 });
  }
  if (!author) {
    return NextResponse.json({ success: false, error: 'Transaction author is required.' }, { status: 400 });
  }

  try {
    const result = await getPool().query(
      `INSERT INTO le_balance_log (
         balance, previous_balance, action, reason, updated_by, author
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [balance, previousBalance, action, reason, storageAccount, author]
    );
    const timestamp = new Date(result.rows[0].created_at);
    const discordPosted = await postDiscordUpdate({ balance, action, reason, author, timestamp });

    return NextResponse.json({
      success: true,
      id: Number(result.rows[0].id),
      balance,
      formatted_balance: formatBalance(balance),
      timestamp: timestamp.toISOString(),
      discord_posted: discordPosted,
    });
  } catch (error) {
    console.error('LE balance update error:', error);
    return NextResponse.json({ success: false, error: 'Could not record the guild balance.' }, { status: 500 });
  }
}
