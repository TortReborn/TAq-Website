import useSWR from 'swr';
import { fetcher } from './fetcher';
import type { BuildDefinition, VersionRef } from '@/lib/build-constants';

export interface MemberBuildRef {
  buildKey: string;
  major: number;
  minor: number;
}

export interface MemberWithBuilds {
  uuid: string;
  ign: string;
  discordRank: string | null;
  builds: MemberBuildRef[];
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

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${method} ${url} failed`;
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
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

  // Assign or upgrade a member to a specific version of a build.
  // If `version` is omitted, the backend defaults to the latest.
  const assignBuild = async (uuid: string, buildKey: string, version?: VersionRef) => {
    await postJson('/api/exec/builds', 'POST', {
      uuid,
      buildKey,
      ...(version ? { major: version.major, minor: version.minor } : {}),
    });
    mutate();
  };

  const removeBuild = async (uuid: string, buildKey: string) => {
    await postJson('/api/exec/builds', 'DELETE', { uuid, buildKey });
    mutate();
  };

  const toggleFlag = async (uuid: string, flag: string, action: 'add' | 'remove') => {
    await postJson('/api/exec/builds', 'PATCH', { uuid, flag, action });
    mutate();
  };

  const createBuildDefinition = async (def: {
    key: string;
    name: string;
    role: string;
    color: string;
    connsUrl: string;
    hqUrl: string;
  }) => {
    await postJson('/api/exec/builds/definitions', 'POST', def);
    mutate();
  };

  // Edit only display metadata. Per-version Conns/HQ links are edited via
  // editBuildVersion.
  const updateBuildDefinition = async (def: {
    key: string;
    name: string;
    role: string;
    color: string;
  }) => {
    await postJson('/api/exec/builds/definitions', 'PATCH', def);
    mutate();
  };

  const deleteBuildDefinition = async (key: string) => {
    await postJson('/api/exec/builds/definitions', 'DELETE', { key });
    mutate();
  };

  // Bump a build to a new version. Members on the previous version are not
  // touched — they stay pinned and get visually flagged as outdated.
  const bumpBuildVersion = async (
    buildKey: string,
    bump: 'minor' | 'major',
    overrides?: { connsUrl?: string; hqUrl?: string; notes?: string }
  ) => {
    await postJson('/api/exec/builds/versions', 'POST', { buildKey, bump, ...(overrides ?? {}) });
    mutate();
  };

  const editBuildVersion = async (
    buildKey: string,
    version: VersionRef,
    patch: { connsUrl?: string; hqUrl?: string; notes?: string }
  ) => {
    await postJson('/api/exec/builds/versions', 'PATCH', {
      buildKey,
      major: version.major,
      minor: version.minor,
      ...patch,
    });
    mutate();
  };

  const deleteBuildVersion = async (buildKey: string, version: VersionRef) => {
    await postJson('/api/exec/builds/versions', 'DELETE', {
      buildKey,
      major: version.major,
      minor: version.minor,
    });
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
    bumpBuildVersion,
    editBuildVersion,
    deleteBuildVersion,
  };
}
