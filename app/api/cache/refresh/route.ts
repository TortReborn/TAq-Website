import { NextResponse } from 'next/server';
import dbCache from '@/lib/db-cache';

export async function POST() {
  try {
    console.log('🔄 Force refreshing territories cache...');
    
    // Force refresh territories cache
    const territories = await dbCache.getTerritories();
    
    if (territories) {
      return NextResponse.json({
        success: true,
        message: 'Territories cache refreshed successfully',
        timestamp: Date.now(),
        territoriesCount: Object.keys(territories).length
      });
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to refresh territories cache' 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error refreshing cache:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to refresh cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
