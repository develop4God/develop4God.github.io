(function (global) {
    'use strict';

    // Turns the reader's state into DOM: the intro (C0) or the current page with its progress,
    // paging, and the completion footer on the last page. Also switches the page between the list
    // and the reader. Every action goes through `actions` (the reader page), so the view holds no
    // rules of its own.
    function createReaderView({ dom, root, listView, detailView, actions }) {
        function showReader() {
            listView.hidden = true;
            detailView.hidden = false;
        }

        function showList() {
            listView.hidden = false;
            detailView.hidden = true;
        }

        function readerChildren(state) {
            const page = state.pages[state.index];
            const pages = dom.buildPage(page, state.summary.id);
            return [
                dom.buildProgress(state.pages.length, state.index, state.summary.title, { onSelect: actions.goTo }),
                pages,
                page.isLast ? dom.buildFooter({ isCompleted: state.footer.isCompleted, justCompleted: state.justCompleted, copyright: state.footer.copyright, onComplete: actions.complete }) : null,
                dom.buildNav({ index: state.index, total: state.pages.length, onPrev: actions.prev, onNext: actions.next, onExit: actions.exit }),
            ];
        }

        function render(state) {
            if (state.notFound) {
                root.replaceChildren(dom.buildNotFound({ onBack: actions.exit }));
                return;
            }
            if (state.error) {
                root.replaceChildren(dom.buildError({ onRetry: () => actions.open(state.summary) }));
                return;
            }
            if (state.phase === 'intro') {
                root.replaceChildren(dom.buildIntro(state.intro, { onEnter: actions.enter, onBack: actions.exit }));
                return;
            }
            const wrapper = root.ownerDocument.createElement('div');
            wrapper.className = 'encounter-pages';
            wrapper.append(...readerChildren(state).filter(Boolean));
            root.replaceChildren(wrapper);
        }

        return { showReader, showList, render };
    }

    global.EncounterReaderView = { createReaderView };
})(window);
