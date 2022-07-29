import github from '@actions/github';
import core from '@actions/core';
import { PullRequestEvent } from '@octokit/webhooks-types';
import { Octokit, Config, File, Rule } from "./types";

import checkAssets from './rules/assets';
import checkAuthors from './rules/authors';
import checkStatus from './rules/statuschange';
import checkTerminalStatus from './rules/terminal';
import checkOtherFiles from './rules/unknown';

let rules = [ checkAssets, checkAuthors, checkStatus, checkTerminalStatus, checkOtherFiles ];

export default async function(octokit: Octokit, config: Config, files: File[]) {
    let files2: File[] = await Promise.all(files.map(async file => {
        // Deconstruct
        const payload = github.context.payload as PullRequestEvent;
        const { repository, pull_request } = payload;
        
        // Get file contents
        if (["removed", "modified", "renamed"].includes(file.status)) {
            const response = await octokit.request(`GET /repos/${repository.owner.login}/${repository.name}/contents/${file.previous_filename || file.filename}`);
            file.previous_contents = Buffer.from(response.data.content, "base64").toString("utf8");
            if (!file.previous_contents) {
                core.warning(`Could not get previous contents of ${file.filename}`, { file: file.filename });
            }
        }

        if (["modified", "renamed", "added", "copied"].includes(file.status)) {
            const response = await octokit.request(`GET /repos/${pull_request.base.repo.owner.login}/${pull_request.base.repo.name}/contents/${file.filename}?ref=${pull_request.head.sha}`);
            file.contents = Buffer.from(response.data.content, "base64").toString("utf8");
            if (!file.contents) {
                core.warning(`Could not get new contents of ${file.filename}`, { file: file.filename });
            }
        }

        return file;
    }));

    // Get results
    let res : Rule[][] = await Promise.all(rules.map(rule => rule(octokit, config, files2)));

    // Merge results
    let ret: Rule[] = [];
    res.forEach(val => ret.push(...val));
    return ret;
}