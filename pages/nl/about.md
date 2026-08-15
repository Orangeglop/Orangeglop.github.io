---
layout: page
title: About me
lang: nl
ref: about-page
permalink: /nl/about/
weight: 3
---

<div class="about-page">

  <h5 class="section-title">{{ site.data.strings.about_me[page.lang] }}</h5>

  <p class="lead mb-4" style="font-size: 1.05rem; line-height: 1.75;">
    {{ site.data.strings.about_me_text[page.lang] | replace: "%AUTHOR_NAME%", site.author.name }}
  </p>

  <div class="my-4">
    {% include elements/about_me_carousel.html %}
  </div>

  <div class="row">
    {% assign skills_title = site.data.strings.skills[page.lang] %}
    {% include about/skills.html title=skills_title %}
  </div>

  <div class="row">
    {% assign education_title = site.data.strings.education[page.lang] %}
    {% include about/education.html title=education_title %}
  </div>

  <div class="row mb-4">
    {% assign experience_title = site.data.strings.experiences[page.lang] %}
    {% include about/experience.html title=experience_title %}
  </div>

</div>
