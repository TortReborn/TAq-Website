import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { getQuestionsForType } from '@/lib/application-questions';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Rate limit
  const rateLimitCheck = checkRateLimit(request, 'applications');
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }
  incrementRateLimit(request, 'applications');

  // Verify session
  const session = getSession(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Discord authentication required. Please use the link from Discord.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { application_type, answers } = body;

    // Validate application type matches session
    if (application_type !== session.application_type) {
      return NextResponse.json(
        { error: 'Application type mismatch.' },
        { status: 400 }
      );
    }

    if (application_type !== 'guild' && application_type !== 'community') {
      return NextResponse.json(
        { error: 'Invalid application type.' },
        { status: 400 }
      );
    }

    // Validate answers
    if (!answers || typeof answers !== 'object') {
      return NextResponse.json(
        { error: 'Answers are required.' },
        { status: 400 }
      );
    }

    const questions = getQuestionsForType(application_type);

    // Check required fields and length limits
    for (const question of questions) {
      const answer = answers[question.id];

      if (question.required) {
        if (!answer || (typeof answer === 'string' && answer.trim().length === 0)) {
          return NextResponse.json(
            { error: `"${question.label}" is required.` },
            { status: 400 }
          );
        }
      }

      if (answer && typeof answer === 'string') {
        if (question.maxLength && answer.length > question.maxLength) {
          return NextResponse.json(
            { error: `"${question.label}" exceeds the maximum length of ${question.maxLength} characters.` },
            { status: 400 }
          );
        }
        if (question.minLength && answer.trim().length < question.minLength) {
          return NextResponse.json(
            { error: `"${question.label}" must be at least ${question.minLength} characters.` },
            { status: 400 }
          );
        }
      }
    }

    // Only keep answers for known question IDs
    const questionIds = new Set(questions.map(q => q.id));
    const sanitizedAnswers: Record<string, string> = {};
    for (const [key, value] of Object.entries(answers)) {
      if (questionIds.has(key) && typeof value === 'string') {
        sanitizedAnswers[key] = value.trim();
      }
    }

    // Insert into database
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(
        `INSERT INTO applications (application_type, discord_id, discord_username, discord_avatar, answers)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, submitted_at`,
        [
          application_type,
          session.discord_id,
          session.discord_username,
          session.discord_avatar,
          JSON.stringify(sanitizedAnswers),
        ]
      );

      const { id, submitted_at } = result.rows[0];

      const response = NextResponse.json(
        { success: true, applicationId: id, submittedAt: submitted_at },
        { status: 201 }
      );

      clearSessionCookie(response);
      return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    } catch (dbError: any) {
      // Unique constraint violation = duplicate pending application
      if (dbError.code === '23505') {
        const response = NextResponse.json(
          { error: 'You already have a pending application of this type.' },
          { status: 409 }
        );
        return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
      }
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error submitting application:', error);
    const response = NextResponse.json(
      { error: 'Failed to submit application. Please try again.' },
      { status: 500 }
    );
    return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
