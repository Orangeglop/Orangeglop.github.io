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

Hello, I'm **{{ site.author.name }}** :wave:, an urban planner and designer, and a landscape enthusiast.<br>
I'm currently living in The Netherlands and working as a freelance planner for several projects in Southeast Asia. I am also learning Dutch to improve my communication skills. This website is created to store my most up-to-date portfolio and featured works. I'm open to work and willingly to relocate within The Netherlands.

<br />

<div class="row">
{% assign skills_title = site.data.strings.skills[page.lang] %}
{% include about/skills.html title=skills_title %}
</div>

<div class="row">
{% assign experience_title = site.data.strings.experiences[page.lang] %}
{% include about/experience.html title=experience_title %}
</div>

<br />

<div class="row">
{% assign education_title = site.data.strings.education[page.lang] %}
{% include about/education.html title=education_title %}
</div>