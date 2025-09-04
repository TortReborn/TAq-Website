import { NextResponse } from 'next/server';
import { aspectClassMap } from '@/lib/aspect-class-map';

export async function GET() {
  return NextResponse.json({
    aspectClassMap,
    invertedMap: Object.fromEntries(
      Object.entries(aspectClassMap).flatMap(([className, aspects]) =>
        aspects.map(aspect => [aspect, className])
      )
    )
  });
}