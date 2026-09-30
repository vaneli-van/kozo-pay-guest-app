<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Item-split selection writes are serialized in the diner app, because the first pick creates the diner's share and parallel writes can race that creation.
The checkout header lives in CheckoutHeader on bill, tip, review, and method screens, so payment progress is shown once beside the restaurant logo without a duplicate app-wide banner.
The live bill's fixed action bar is portaled to document.body and omitted from split underlays, so shell clipping and bill scrolling cannot move or duplicate it.
