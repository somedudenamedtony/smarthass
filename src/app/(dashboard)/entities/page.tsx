"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Entity {
  id: string;
  entityId: string;
  domain: string;
  friendlyName: string | null;
  areaId: string | null;
  lastState: string | null;
  lastChangedAt: string | null;
  isTracked: boolean;
}

interface EntitiesResponse {
  entities: Entity[];
  domains: string[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface HAInstance {
  id: string;
  name: string;
}

export default function EntitiesPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [data, setData] = useState<EntitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadEntities = useCallback(async () => {
    if (!selectedInstance) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        instanceId: selectedInstance,
        page: page.toString(),
      });
      if (domain) params.set("domain", domain);
      if (search) params.set("search", search);

      const res = await fetch(`/api/entities?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedInstance, page, domain, search]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  async function toggleTracked(entityId: string, current: boolean) {
    await fetch("/api/entities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entityId, isTracked: !current }),
    });
    loadEntities();
  }

  if (instances.length === 0 && !loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Entities</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No Home Assistant instances connected.{" "}
            <a href="/settings" className="underline">
              Add one in Settings
            </a>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Entities</h1>
        {instances.length > 1 && (
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={selectedInstance ?? ""}
            onChange={(e) => {
              setSelectedInstance(e.target.value);
              setPage(1);
            }}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Search entities…"
          className="max-w-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {data && (
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All domains</option>
            {data.domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading entities…</p>
      ) : !data || data.entities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No entities found. Try syncing your instance first.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {data.pagination.total} entities
              </CardTitle>
              <CardDescription>
                Page {data.pagination.page} of {data.pagination.totalPages}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Entity ID</th>
                      <th className="px-4 py-2 font-medium">Domain</th>
                      <th className="px-4 py-2 font-medium">State</th>
                      <th className="px-4 py-2 font-medium">Last Changed</th>
                      <th className="px-4 py-2 font-medium">Tracked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entities.map((entity) => (
                      <tr
                        key={entity.id}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/entities/${entity.id}`}
                            className="font-medium hover:underline"
                          >
                            {entity.friendlyName || entity.entityId}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                          {entity.entityId}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline">{entity.domain}</Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="secondary">
                            {entity.lastState ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground text-xs">
                          {entity.lastChangedAt
                            ? new Date(entity.lastChangedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <Button
                            variant={entity.isTracked ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              toggleTracked(entity.id, entity.isTracked)
                            }
                          >
                            {entity.isTracked ? "Tracked" : "Track"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
