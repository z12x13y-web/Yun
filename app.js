        '<span class="ep__time">' + esc(ep.duration || "45:00") + "</span></span>" +
        '<span class="ep__name">' + esc(ep.name) + "</span></a>";
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.body.getAttribute("data-page") === "detail") initDetail();
    else initList();
  });
})();
