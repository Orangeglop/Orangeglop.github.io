---
layout: page
title: Over mij
lang: nl
permalink: /nl/about/
ref: about-page
weight: 3
---

###### **{{ site.data.strings.about_me[page.lang] }}**

---

{{ site.data.strings.about_me_text[page.lang] | replace: "%AUTHOR_NAME%", site.author.name }}

<br />

{% include elements/about_me_carousel.html %}

<br />

<div class="row">
{% assign skills_title = site.data.strings.skills[page.lang] %}
{% include about/skills.html title=skills_title %}
</div>

<div class="row">
{% assign education_title = site.data.strings.education[page.lang] %}
{% include about/education.html title=education_title %}
</div>

<br />

<div class="row">
{% assign experience_title = site.data.strings.experiences[page.lang] %}
{% include about/experience.html title=experience_title %}
</div>
