import { NextResponse } from 'next/server';
import { clearExecSessionCookie, getBaseUrl } from '@/lib/exec-auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearExecSessionCookie(response);
  return response;
}

export async function GET() {
  const baseUrl = getBaseUrl();
  const response = NextResponse.redirect(new URL('/exec/login', baseUrl));
  clearExecSessionCookie(response);
  return response;
}
