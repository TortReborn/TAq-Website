import { NextResponse } from 'next/server';
import dbCache from '@/lib/db-cache';

export async function GET() {
  try {
    // Get a sample of territory data for debugging
    const territories = await dbCache.getTerritories();
    
    if (!territories) {
      return NextResponse.json({ error: 'No territory data available' });
    }

    // Return just a few territories for debugging
    const sampleTerritories = Object.entries(territories).slice(0, 5);
    const sample: Record<string, any> = {};
    
    for (const [name, territory] of sampleTerritories) {
      const territoryData = territory as any;
      sample[name] = {
        guild: territoryData.guild,
        acquired: territoryData.acquired,
        // Add timestamp for debugging
        lastChecked: new Date().toISOString()
      };
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      totalTerritories: Object.keys(territories).length,
      sample
    });

  } catch (error) {
    console.error('Error in territory debug:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get territory debug data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
