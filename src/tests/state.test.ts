/**
 * state.ts 纯函数测试 — parseGitUrl 三种 URL 格式解析
 */

import { describe, it } from "node:test";
import { deepStrictEqual, throws } from "node:assert/strict";
import { parseGitUrl } from "../state.js";

describe("parseGitUrl", () => {
  // ── SCP 格式: git@host:owner/repo.git ──
  describe("SCP 格式 (git@host:...)", () => {
    it("标准 GitHub 地址", () => {
      deepStrictEqual(parseGitUrl("git@github.com:user/repo.git"), {
        host: "github.com", owner: "user", repo: "repo",
      });
    });

    it("含组织/多级 owner", () => {
      deepStrictEqual(parseGitUrl("git@github.com:myteam/subgroup/backend.git"), {
        host: "github.com", owner: "myteam/subgroup", repo: "backend",
      });
    });

    it("无 .git 后缀", () => {
      deepStrictEqual(parseGitUrl("git@gitlab.com:company/service"), {
        host: "gitlab.com", owner: "company", repo: "service",
      });
    });

    it("CodeHub 风格", () => {
      deepStrictEqual(parseGitUrl("git@git.example.com:demo/project.git"), {
        host: "git.example.com", owner: "demo", repo: "project",
      });
    });
  });

  // ── HTTPS 格式: https://host/owner/repo.git ──
  describe("HTTPS 格式", () => {
    it("标准 GitHub HTTPS", () => {
      deepStrictEqual(parseGitUrl("https://github.com/user/repo.git"), {
        host: "github.com", owner: "user", repo: "repo",
      });
    });

    it("无 .git 后缀", () => {
      deepStrictEqual(parseGitUrl("https://gitlab.com/group/project"), {
        host: "gitlab.com", owner: "group", repo: "project",
      });
    });
  });

  // ── SSH 格式: ssh://git@host/owner/repo.git ──
  describe("SSH 格式 (ssh://)", () => {
    it("标准 SSH URL", () => {
      deepStrictEqual(parseGitUrl("ssh://git@github.com/user/repo.git"), {
        host: "github.com", owner: "user", repo: "repo",
      });
    });

    it("无 .git 后缀", () => {
      deepStrictEqual(parseGitUrl("ssh://git@gitlab.com/team/project"), {
        host: "gitlab.com", owner: "team", repo: "project",
      });
    });
  });

  // ── 异常路径 ──
  describe("异常输入", () => {
    it("空字符串抛出错误", () => {
      throws(() => parseGitUrl(""), /无法解析 Git URL/);
    });

    it("非法格式抛出错误", () => {
      throws(() => parseGitUrl("not-a-valid-url"), /无法解析 Git URL/);
    });

    it("纯 http 无 git 上下文抛出错误", () => {
      throws(() => parseGitUrl("http://example.com"), /无法解析 Git URL/);
    });
  });
});
