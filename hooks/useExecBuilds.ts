import useSWR from 'swr';
import { fetcher } from './fetcher';
import type { BuildDefinition } from '@/lib/build-constants';

export interface MemberWithBuilds {
  uuid: string;
  ign: string;
  discordRank: string | null;
  builds: string[];
  flags: string[];
}

export interface GuildMemberStub {
  uuid: string;
  ign: string;
  discordRank: string | null;
}

interface BuildsResponse {
  members: MemberWithBuilds[];
  allGuildMembers: GuildMemberStub[];
  buildDefinitions: BuildDefinition[];
  lastUpdated: string | null;
}

export function useExecBuilds() {
  const { data, error, isLoading, mutate } = useSWR<BuildsResponse>(
    '/api/exec/builds',
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 30000,
      dedupingInterval: 10000,
    }
  );

  const assignBuild = async (uuid: string, buildKey: string) => {
    await fetch('/api/exec/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, buildKey }),
    });
    mutate();
  };

  const removeBuild = async (uuid: string, buildKey: string) => {
    await fetch('/api/exec/builds', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, buildKey }),
    });
    mutate();
  };

  const toggleFlag = async (uuid: string, flag: string, action: 'add' | 'remove') => {
    await fetch('/api/exec/builds', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, flag, action }),
    });
    mutate();
  };

  const createBuildDefinition = async (def: { key: string; name: string; role: string; color: string; connsUrl: string; hqUrl: string }) => {
    const res = await fetch('/api/exec/builds/definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(def),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create build');
    }
    mutate();
  };

  const updateBuildDefinition = async (def: { key: string; name: string; role: string; color: string; connsUrl: string; hqUrl: string }) => {
    const res = await fetch('/api/exec/builds/definitions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(def),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update build');
    }
    mutate();
  };

  const deleteBuildDefinition = async (key: string) => {
    const res = await fetch('/api/exec/builds/definitions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete build');
    }
    mutate();
  };

  return {
    members: data?.members ?? [],
    allGuildMembers: data?.allGuildMembers ?? [],
    buildDefinitions: data?.buildDefinitions ?? [],
    lastUpdated: data?.lastUpdated ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    assignBuild,
    removeBuild,
    toggleFlag,
    createBuildDefinition,
    updateBuildDefinition,
    deleteBuildDefinition,
  };
}
