---
layout: page
title: About me
lang: nl
ref: about-page
permalink: /nl/about/
weight: 3
---

<div class="about-page">

  <div class="hero-banner" data-reveal>
    <div class="hero-meta mb-2">
      <span class="badge badge-status">
        {{ site.data.strings.status_available[page.lang] | default: "Open voor kansen in Nederland" }}
      </span>
    </div>
    <p class="hero-intro-text">
      {{ site.data.strings.about_me_text[page.lang] | replace: "%AUTHOR_NAME%", site.author.name }}
    </p>
  </div>

  <div class="section-header" style="margin-top: 2.5rem;" data-reveal>
    <h2 class="section-title">
      {{ site.data.strings.analytical_drawings[page.lang] | default: "Analytische Studies & Ruimtelijke Diagrammen" }}
    </h2>
  </div>

  <div style="margin-bottom: 2.5rem;">
    {% include elements/about_me_carousel.html %}
  </div>

  {% assign skills_title = site.data.strings.skills[page.lang] %}
  {% include about/skills.html title=skills_title %}

  {% assign education_title = site.data.strings.education[page.lang] %}
  {% include about/education.html title=education_title %}

  {% assign experience_title = site.data.strings.experiences[page.lang] %}
  {% include about/experience.html title=experience_title %}

</div>
