// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  friendlyInboundFilesText,
  restyleInboundFileBubbles,
} from '../src/client/inbound-files-display.ts';

const dump = `<dsh_im_files>
{"description":"Files uploaded with this user message. Paths are relative to the current Harness workspace.","files":[{"name":"笔记列表明细表+(2).xlsx","path":".dsh-im/inbound/turn-xJILCg/01-笔记列表明细表__2_.xlsx"}]}
</dsh_im_files>`;

test('friendlyInboundFilesText leaves ordinary chat text alone', () => {
  assert.equal(friendlyInboundFilesText('看看这个表格'), '看看这个表格');
  assert.equal(friendlyInboundFilesText(''), '');
});

test('friendlyInboundFilesText turns a stored dump into a file name line', () => {
  assert.equal(friendlyInboundFilesText(dump), '已上传文件 笔记列表明细表+(2).xlsx');
  assert.equal(
    friendlyInboundFilesText(`请处理\n\n${dump}`),
    '请处理\n\n已上传文件 笔记列表明细表+(2).xlsx',
  );
  assert.equal(friendlyInboundFilesText(dump).includes('<dsh_im_files>'), false);
  assert.equal(friendlyInboundFilesText(dump).includes('Files uploaded'), false);
});

test('friendlyInboundFilesText interpolates through the translator', () => {
  const t = (key, vars) => {
    if (key === '已上传文件 {name}' && vars?.name) return `Uploaded file ${vars.name}`;
    return key;
  };
  assert.equal(friendlyInboundFilesText(dump, t), 'Uploaded file 笔记列表明细表+(2).xlsx');
});

test('friendlyInboundFilesText falls back when the dump JSON is unreadable', () => {
  assert.equal(friendlyInboundFilesText('<dsh_im_files>\nnot-json\n</dsh_im_files>'), '已上传文件');
});

test('restyleInboundFileBubbles rewrites matching text nodes', () => {
  const node = { nodeValue: dump };
  const fakeDoc = {
    nodeType: 9,
    body: {},
    createTreeWalker() {
      let done = false;
      return {
        currentNode: null,
        nextNode() {
          if (done) return false;
          done = true;
          this.currentNode = node;
          return true;
        },
      };
    },
  };
  assert.equal(restyleInboundFileBubbles(fakeDoc), 1);
  assert.equal(node.nodeValue, '已上传文件 笔记列表明细表+(2).xlsx');
});
