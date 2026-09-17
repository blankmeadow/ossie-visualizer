"""Offline provider -- lets the whole product run with no API key and no network.

Two behaviours, in priority order:

1. If the uploaded file is a ``.txt`` (or has a ``<image>.txt`` sidecar), its
   contents are used as the restored page text. This is how the test-suite and
   the demo script feed known material through the real pipeline.
2. Otherwise a built-in fixture page is returned, chosen deterministically from
   the file's content hash so repeated runs are reproducible.

It never invents meanings: those come from the offline dictionary during
normalisation, exactly as they would if the model omitted them.
"""
from __future__ import annotations

import hashlib
import os

from .base import ImageInput, PageText, ProviderResult, VisionProvider

FIXTURE_PAGES: list[str] = [
    # Matches the "Unit 3" textbook spread in the product mockups.
    """Unit 3
1. look for      寻找
2. find out      弄清楚
3. take care of  照顾
4. be good at    擅长
5. keep going    继续前进
6. because       因为

The little fox walks into the forest.
He is looking for his mother.
"Do not be afraid," says the bird. "I will take care of you."
The fox keeps going because he wants to find out where she is.
""",
    # A picture-book page.
    """Little Bear wakes up early in the morning.
He looks out of the window and sees the snow.
"I am good at making snowballs," he says suddenly.
Mother Bear gives him a warm coat and a lot of bread.
Little Bear runs into the garden and plays with his friends all day.
""",
    # A worksheet.
    """Read and complete.
1. My sister is afraid of the dark.
2. Please turn off the light before you go to bed.
3. We looked for the lost rabbit in the grass.
4. The children pick up the leaves in front of the school.
5. Tom is late for class because he got up very late.
""",
]


class MockVisionProvider(VisionProvider):
    name = "mock"

    def extract(self, images: list[ImageInput], grade: int) -> ProviderResult:
        pages: list[PageText] = []
        for image in images:
            text = self._read_text(image)
            pages.append(PageText(page_no=image.page_no, text=text))
        # Meanings are intentionally left to the offline dictionary.
        return ProviderResult(pages=pages, items=[])

    def _read_text(self, image: ImageInput) -> str:
        sidecar = None
        if image.path.lower().endswith(".txt"):
            sidecar = image.path
        elif os.path.exists(image.path + ".txt"):
            sidecar = image.path + ".txt"

        if sidecar and os.path.exists(sidecar):
            with open(sidecar, encoding="utf-8") as fh:
                return fh.read()

        seed = b""
        if os.path.exists(image.path):
            with open(image.path, "rb") as fh:
                seed = fh.read(4096)
        else:
            seed = image.path.encode()
        index = int(hashlib.sha256(seed).hexdigest(), 16) % len(FIXTURE_PAGES)
        return FIXTURE_PAGES[index]
