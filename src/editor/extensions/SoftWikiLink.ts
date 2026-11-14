import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { normalizeWikiKey } from '../../services/backlinkService';
import {
  WikiLinkList,
  type WikiLinkListHandle,
  type WikiLinkSuggestionItem,
} from '../components/WikiLinkList';
import { WikiLinkView } from '../components/WikiLinkView';

const WIKI_LINK_SUGGESTION_KEY = new PluginKey('wikiLinkSuggestion');

let workspaceWikiNotesProvider: () => WikiLinkSuggestionItem[] = () => [];

export function setWorkspaceWikiNotesProvider(
  provider: () => WikiLinkSuggestionItem[]
) {
  workspaceWikiNotesProvider = provider;
}

export const SoftWikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  priority: 125,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-target') ?? '',
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="softmath-wikilink"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-wikilink',
        'data-target': HTMLAttributes.target ?? '',
        'data-label': HTMLAttributes.label ?? '',
      }),
      `[[${HTMLAttributes.target ?? ''}]]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  markdownTokenName: 'wikiLink',

  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src) => {
      let idx = src.indexOf('[[');
      while (idx !== -1) {
        if (idx === 0 || src[idx - 1] !== '!') {
          return idx;
        }
        idx = src.indexOf('[[', idx + 2);
      }
      return -1;
    },
    tokenize: (src) => {
      if (!src.startsWith('[[')) return undefined;
      const closeIdx = src.indexOf(']]', 2);
      if (closeIdx === -1) return undefined;
      const inner = src.slice(2, closeIdx).trim();
      if (!inner || inner.includes('\n') || inner.toLowerCase().endsWith('.excalidraw')) {
        return undefined;
      }
      const raw = src.slice(0, closeIdx + 2);
      const pipeIdx = inner.indexOf('|');
      const target = (pipeIdx !== -1 ? inner.slice(0, pipeIdx) : inner).trim();
      const label = (pipeIdx !== -1 ? inner.slice(pipeIdx + 1) : '').trim();
      if (!target) return undefined;

      return {
        type: 'wikiLink',
        raw,
        target,
        label,
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const target = typeof token.target === 'string' ? token.target : '';
    const label = typeof token.label === 'string' ? token.label : '';
    return helpers.createNode('wikiLink', { target, label });
  },

  renderMarkdown: (node) => {
    const target = String(node.attrs?.target ?? '').trim();
    const label = String(node.attrs?.label ?? '').trim();
    if (!target) return '';
    return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
  },

  addProseMirrorPlugins() {
    const suggestionConfig: Omit<
      SuggestionOptions<WikiLinkSuggestionItem>,
      'editor'
    > = {
      pluginKey: WIKI_LINK_SUGGESTION_KEY,
      char: '[[',
      allowSpaces: true,
      allowedPrefixes: [' ', '(', ':'],
      allow: ({ state, range }) => {
        const $from = state.doc.resolve(range.from);
        if ($from.parent.type.spec.code) return false;
        const slice = state.doc.textBetween(range.from, range.to, '');
        return !slice.includes(']]');
      },
      items: ({ query }) => {
        const all = workspaceWikiNotesProvider();
        const q = normalizeWikiKey(query);
        if (!q) return all.slice(0, 12);
        return all
          .filter(
            (n) =>
              normalizeWikiKey(n.displayName).includes(q) ||
              normalizeWikiKey(n.relativePath).includes(q)
          )
          .slice(0, 12);
      },
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'wikiLink',
              attrs: {
                target: props.displayName,
                label: '',
              },
            },
            { type: 'text', text: ' ' },
          ])
          .run();
      },
      render: () => {
        let renderer: ReactRenderer<WikiLinkListHandle> | null = null;
        let popupEl: HTMLDivElement | null = null;

        const updatePos = (clientRect?: (() => DOMRect | null) | null) => {
          if (!popupEl || !clientRect) return;
          const rect = clientRect();
          if (!rect) return;
          const virtualEl = {
            getBoundingClientRect: () => rect,
          };
          void computePosition(virtualEl, popupEl, {
            placement: 'bottom-start',
            middleware: [offset(6), flip(), shift({ padding: 8 })],
          }).then(({ x, y }) => {
            if (!popupEl) return;
            popupEl.style.left = `${x}px`;
            popupEl.style.top = `${y}px`;
          });
        };

        return {
          onStart: (props) => {
            renderer = new ReactRenderer(WikiLinkList, {
              props: {
                items: props.items,
                command: props.command,
              },
              editor: props.editor,
            });
            popupEl = document.createElement('div');
            popupEl.style.position = 'fixed';
            popupEl.style.zIndex = '60';
            popupEl.appendChild(renderer.element);
            document.body.appendChild(popupEl);
            updatePos(props.clientRect);
          },
          onUpdate: (props) => {
            renderer?.updateProps({
              items: props.items,
              command: props.command,
            });
            updatePos(props.clientRect);
          },
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              popupEl?.remove();
              popupEl = null;
              return true;
            }
            return renderer?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            popupEl?.remove();
            popupEl = null;
            renderer?.destroy();
            renderer = null;
          },
        };
      },
    };

    return [
      Suggestion({
        editor: this.editor,
        ...suggestionConfig,
      }),
    ];
  },
});

