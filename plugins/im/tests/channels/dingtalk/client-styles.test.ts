// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import {
  DINGTALK_STYLE_ID,
  installDingtalkStyles,
} from '../../../src/client/channels/dingtalk/styles.ts';

function fakeDocument() {
  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
    },
  };
  return {
    head,
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        textContent: '',
        parentNode: null,
        remove() {
          if (!this.parentNode) return;
          const index = this.parentNode.children.indexOf(this);
          if (index >= 0) this.parentNode.children.splice(index, 1);
          this.parentNode = null;
        },
      };
    },
    querySelector() {
      return head.children.find((node) => node.dataset.pluginCss === DINGTALK_STYLE_ID) ?? null;
    },
  };
}

function withFakeDocument() {
  const previousDocument = globalThis.document;
  const document = fakeDocument();
  globalThis.document = document;
  onTestFinished(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return document;
}

test('shared DingTalk styles survive until the last channel page releases them', () => {
  const document = withFakeDocument();

  const disposeFirst = installDingtalkStyles();
  const disposeSecond = installDingtalkStyles();
  assert.equal(document.head.children.length, 1, 'a second install reuses the shared style node');

  disposeFirst();
  assert.equal(
    document.head.children.length,
    1,
    'unmounting the first channel must not delete CSS a later channel still uses',
  );

  disposeSecond();
  assert.equal(document.head.children.length, 0, 'the last release removes the style node');
});

test('releasing the same DingTalk style installer twice only decrements once', () => {
  const document = withFakeDocument();

  const disposeFirst = installDingtalkStyles();
  const disposeSecond = installDingtalkStyles();

  disposeFirst();
  disposeFirst();
  assert.equal(document.head.children.length, 1, 'a double release must not steal the remaining reference');

  disposeSecond();
  assert.equal(document.head.children.length, 0);

  const disposeAgain = installDingtalkStyles();
  assert.equal(document.head.children.length, 1, 'styles can be reinstalled after full removal');
  disposeAgain();
  assert.equal(document.head.children.length, 0);
});
